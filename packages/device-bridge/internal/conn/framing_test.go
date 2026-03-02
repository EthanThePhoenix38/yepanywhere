package conn

import (
	"bytes"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"
)

func TestFramingRoundTrip(t *testing.T) {
	sidecarToDeviceR, sidecarToDeviceW := io.Pipe()
	deviceToSidecarR, deviceToSidecarW := io.Pipe()

	testJPEG := []byte{0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x01, 0x02, 0x03}
	controlPayload := []byte(`{"cmd":"touch","touches":[{"x":0.5,"y":0.3,"pressure":1.0}]}`)

	deviceErrCh := make(chan error, 1)
	go func() {
		defer close(deviceErrCh)
		defer deviceToSidecarW.Close()

		msgType, payload, err := ReadMessage(sidecarToDeviceR)
		if err != nil {
			deviceErrCh <- fmt.Errorf("read frame request: %w", err)
			return
		}
		if msgType != TypeFrameRequest {
			deviceErrCh <- fmt.Errorf("expected frame request type 0x01, got 0x%02x", msgType)
			return
		}
		if len(payload) != 0 {
			deviceErrCh <- fmt.Errorf("expected empty frame request payload, got %d bytes", len(payload))
			return
		}

		if err := WriteFrameResponse(deviceToSidecarW, testJPEG); err != nil {
			deviceErrCh <- fmt.Errorf("write frame response: %w", err)
			return
		}

		msgType, payload, err = ReadMessage(sidecarToDeviceR)
		if err != nil {
			deviceErrCh <- fmt.Errorf("read control: %w", err)
			return
		}
		if msgType != TypeControl {
			deviceErrCh <- fmt.Errorf("expected control type 0x03, got 0x%02x", msgType)
			return
		}
		if !bytes.Equal(payload, controlPayload) {
			deviceErrCh <- fmt.Errorf("control payload mismatch")
			return
		}

		deviceErrCh <- nil
	}()

	if err := WriteFrameRequest(sidecarToDeviceW); err != nil {
		t.Fatalf("write frame request: %v", err)
	}

	msgType, payload, err := ReadMessage(deviceToSidecarR)
	if err != nil {
		t.Fatalf("read frame response: %v", err)
	}
	if msgType != TypeFrameResponse {
		t.Fatalf("expected frame response type 0x02, got 0x%02x", msgType)
	}
	if !bytes.Equal(payload, testJPEG) {
		t.Fatalf("frame payload mismatch")
	}

	if err := WriteControl(sidecarToDeviceW, controlPayload); err != nil {
		t.Fatalf("write control: %v", err)
	}
	if err := sidecarToDeviceW.Close(); err != nil {
		t.Fatalf("close sidecar->device writer: %v", err)
	}

	select {
	case deviceErr := <-deviceErrCh:
		if deviceErr != nil {
			t.Fatalf("device goroutine: %v", deviceErr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for device goroutine")
	}
}

func TestReadMessageRejectsUnknownType(t *testing.T) {
	_, _, err := ReadMessage(bytes.NewReader([]byte{0x7f}))
	if err == nil {
		t.Fatal("expected error for unknown message type")
	}
	if !strings.Contains(err.Error(), "unknown message type") {
		t.Fatalf("unexpected error: %v", err)
	}
}
