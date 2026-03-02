package emulator

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// Frame holds a single screenshot from the emulator.
type Frame struct {
	Data      []byte // RGB888 pixels, bottom-up row order
	Width     int32
	Height    int32
	Seq       uint32
	Timestamp uint64 // microseconds from emulator
}

// FrameSource manages the screenshot stream and distributes frames to subscribers.
// Polling automatically pauses when there are no subscribers and resumes when one arrives.
type FrameSource struct {
	client        *Client
	maxWidth      int // passed to emulator for server-side scaling (0 = native)
	frameInterval time.Duration // minimum time between gRPC polls; 0 = no limit
	lastFrame     atomic.Pointer[Frame]
	mu            sync.RWMutex
	subs          map[int]chan<- *Frame
	nextID        int
	cancel        context.CancelFunc
	wakeup        chan struct{} // buffered(1), signaled on 0→1 subscriber transition
}

// NewFrameSource starts streaming screenshots and dispatching to subscribers.
// maxWidth tells the emulator to scale frames server-side (0 = native resolution).
// fps limits the gRPC polling rate; 0 means poll as fast as possible.
// Polling is paused until the first subscriber arrives.
func NewFrameSource(client *Client, maxWidth, fps int) *FrameSource {
	ctx, cancel := context.WithCancel(context.Background())
	var frameInterval time.Duration
	if fps > 0 {
		frameInterval = time.Second / time.Duration(fps)
	}
	fs := &FrameSource{
		client:        client,
		maxWidth:      maxWidth,
		frameInterval: frameInterval,
		subs:          make(map[int]chan<- *Frame),
		cancel:        cancel,
		wakeup:        make(chan struct{}, 1),
	}
	go fs.run(ctx)
	return fs
}

// Subscribe returns a channel that receives frames.
// Slow consumers will have frames dropped (non-blocking send).
// If a frame has already been received, it is immediately sent to the new subscriber
// so that late-joining consumers (e.g. the encoding pipeline) don't miss the initial frame.
func (fs *FrameSource) Subscribe() (id int, ch <-chan *Frame) {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	id = fs.nextID
	fs.nextID++
	c := make(chan *Frame, 2)
	fs.subs[id] = c

	// Wake up polling loop on 0→1 transition.
	if len(fs.subs) == 1 {
		select {
		case fs.wakeup <- struct{}{}:
		default:
		}
	}

	// Replay the last frame so subscribers that join after the initial
	// gRPC frame was received still get something to encode.
	if last := fs.lastFrame.Load(); last != nil {
		c <- last
	}

	return id, c
}

// Unsubscribe removes a subscriber.
func (fs *FrameSource) Unsubscribe(id int) {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	if ch, ok := fs.subs[id]; ok {
		close(ch)
		delete(fs.subs, id)
	}
	if len(fs.subs) == 0 {
		log.Printf("[FrameSource] no subscribers, pausing polling")
	}
}

// LastFrame returns the most recently received frame, or nil if none yet.
func (fs *FrameSource) LastFrame() *Frame {
	return fs.lastFrame.Load()
}

// Stop shuts down the frame source.
func (fs *FrameSource) Stop() {
	fs.cancel()
}

func (fs *FrameSource) subscriberCount() int {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	return len(fs.subs)
}

func (fs *FrameSource) run(ctx context.Context) {
	var seq uint32
	for {
		// Wait for at least one subscriber before polling.
		if fs.subscriberCount() == 0 {
			select {
			case <-fs.wakeup:
				log.Printf("[FrameSource] subscriber arrived, resuming polling")
			case <-ctx.Done():
				return
			}
		}

		pollStart := time.Now()
		frame, err := fs.client.GetOneScreenshot(ctx, fs.maxWidth)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[FrameSource] poll error: %v", err)
			continue
		}

		seq++
		frame.Seq = seq
		fs.lastFrame.Store(frame)
		fs.dispatch(frame)

		// Rate-limit gRPC polling to avoid screenshotting far faster than
		// subscribers consume. Sleep for whatever remains of the frame interval
		// after accounting for the gRPC call's own latency.
		if fs.frameInterval > 0 {
			if sleep := fs.frameInterval - time.Since(pollStart); sleep > 0 {
				select {
				case <-time.After(sleep):
				case <-ctx.Done():
					return
				}
			}
		}
	}
}

func (fs *FrameSource) dispatch(frame *Frame) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	for _, ch := range fs.subs {
		// Non-blocking send — drop frame for slow consumers.
		select {
		case ch <- frame:
		default:
		}
	}
}
