package ipc

import (
	"fmt"
	"log"
	"sync"

	"github.com/anthropics/yepanywhere/emulator-bridge/internal/emulator"
)

// clientEntry is a ref-counted gRPC client.
type clientEntry struct {
	client   *emulator.Client
	refCount int
}

// frameSourceEntry is a ref-counted FrameSource.
type frameSourceEntry struct {
	source   *emulator.FrameSource
	refCount int
}

// frameSourceKey uniquely identifies a FrameSource by emulator + resolution.
type frameSourceKey struct {
	emulatorID string
	maxWidth   int
}

// ResourcePool manages shared gRPC clients and FrameSources across sessions.
// Multiple sessions viewing the same emulator at the same resolution share
// a single gRPC connection and polling loop.
type ResourcePool struct {
	mu           sync.Mutex
	clients      map[string]*clientEntry
	frameSources map[frameSourceKey]*frameSourceEntry
}

// NewResourcePool creates an empty resource pool.
func NewResourcePool() *ResourcePool {
	return &ResourcePool{
		clients:      make(map[string]*clientEntry),
		frameSources: make(map[frameSourceKey]*frameSourceEntry),
	}
}

// AcquireClient returns a shared gRPC Client for the emulator, creating one if needed.
func (rp *ResourcePool) AcquireClient(emulatorID string) (*emulator.Client, error) {
	rp.mu.Lock()
	defer rp.mu.Unlock()

	if entry, ok := rp.clients[emulatorID]; ok {
		entry.refCount++
		log.Printf("[ResourcePool] reusing client for %s (refs=%d)", emulatorID, entry.refCount)
		return entry.client, nil
	}

	grpcAddr := GRPCAddr(emulatorID)
	client, err := emulator.NewClient(grpcAddr)
	if err != nil {
		return nil, fmt.Errorf("connecting to emulator %s: %w", emulatorID, err)
	}

	rp.clients[emulatorID] = &clientEntry{client: client, refCount: 1}
	log.Printf("[ResourcePool] created new client for %s", emulatorID)
	return client, nil
}

// ReleaseClient decrements the ref count and closes the client when it reaches 0.
func (rp *ResourcePool) ReleaseClient(emulatorID string) {
	rp.mu.Lock()
	defer rp.mu.Unlock()

	entry, ok := rp.clients[emulatorID]
	if !ok {
		return
	}

	entry.refCount--
	if entry.refCount <= 0 {
		entry.client.Close()
		delete(rp.clients, emulatorID)
		log.Printf("[ResourcePool] closed client for %s", emulatorID)
	}
}

// AcquireFrameSource returns a shared FrameSource, creating one if needed.
// The client must already be acquired via AcquireClient.
// fps is passed to NewFrameSource to cap the gRPC polling rate (0 = unlimited).
func (rp *ResourcePool) AcquireFrameSource(emulatorID string, maxWidth, fps int, client *emulator.Client) *emulator.FrameSource {
	rp.mu.Lock()
	defer rp.mu.Unlock()

	key := frameSourceKey{emulatorID: emulatorID, maxWidth: maxWidth}
	if entry, ok := rp.frameSources[key]; ok {
		entry.refCount++
		log.Printf("[ResourcePool] reusing FrameSource for %s@%d (refs=%d)", emulatorID, maxWidth, entry.refCount)
		return entry.source
	}

	fs := emulator.NewFrameSource(client, maxWidth, fps)
	rp.frameSources[key] = &frameSourceEntry{source: fs, refCount: 1}
	log.Printf("[ResourcePool] created new FrameSource for %s@%d fps=%d", emulatorID, maxWidth, fps)
	return fs
}

// ReleaseFrameSource decrements the ref count and stops the FrameSource when it reaches 0.
func (rp *ResourcePool) ReleaseFrameSource(emulatorID string, maxWidth int) {
	rp.mu.Lock()
	defer rp.mu.Unlock()

	key := frameSourceKey{emulatorID: emulatorID, maxWidth: maxWidth}
	entry, ok := rp.frameSources[key]
	if !ok {
		return
	}

	entry.refCount--
	if entry.refCount <= 0 {
		entry.source.Stop()
		delete(rp.frameSources, key)
		log.Printf("[ResourcePool] stopped FrameSource for %s@%d", emulatorID, maxWidth)
	}
}

// CloseAll releases all resources regardless of ref counts.
func (rp *ResourcePool) CloseAll() {
	rp.mu.Lock()
	defer rp.mu.Unlock()

	for key, entry := range rp.frameSources {
		entry.source.Stop()
		delete(rp.frameSources, key)
	}
	for id, entry := range rp.clients {
		entry.client.Close()
		delete(rp.clients, id)
	}
}
