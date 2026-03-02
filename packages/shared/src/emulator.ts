/**
 * Shared types for the Android emulator streaming feature.
 *
 * These types are used by:
 * - Server: EmulatorBridgeService, REST routes, relay message routing
 * - Client: Emulator tab UI, WebRTC signaling (Phase 3)
 */

// ============================================================================
// Emulator Discovery
// ============================================================================

/** Info about a discovered Android emulator (from ADB + AVD detection). */
export interface EmulatorInfo {
  /** Emulator identifier, e.g., "emulator-5554" (running) or "avd-Pixel_7" (stopped) */
  id: string;
  /** AVD profile name, e.g., "Pixel_7" */
  avd: string;
  /** Whether the emulator is currently running */
  state: "running" | "stopped";
}

// ============================================================================
// Client → Server: Emulator signaling messages (carried via relay WebSocket)
// ============================================================================

/** Client requests to start streaming an emulator. */
export interface EmulatorStreamStart {
  type: "emulator_stream_start";
  /** Client-generated UUID for this streaming session */
  sessionId: string;
  /** Which emulator to stream (EmulatorInfo.id) */
  emulatorId: string;
  /** Optional streaming parameters */
  options?: { maxFps?: number; maxWidth?: number; quality?: number };
}

/** Client requests to stop streaming. */
export interface EmulatorStreamStop {
  type: "emulator_stream_stop";
  /** Streaming session ID from emulator_stream_start */
  sessionId: string;
}

/** Client sends SDP answer for WebRTC negotiation. */
export interface EmulatorWebRTCAnswer {
  type: "emulator_webrtc_answer";
  sessionId: string;
  sdp: string;
}

/** Client sends an ICE candidate (trickle ICE). */
export interface EmulatorICECandidate {
  type: "emulator_ice_candidate";
  sessionId: string;
  /** null = end-of-candidates signal */
  candidate: RTCIceCandidateInit | null;
}

/** Union of all client→server emulator messages */
export type EmulatorClientMessage =
  | EmulatorStreamStart
  | EmulatorStreamStop
  | EmulatorWebRTCAnswer
  | EmulatorICECandidate;

// ============================================================================
// Server → Client: Emulator signaling messages (pushed via relay WebSocket)
// ============================================================================

/** Server sends SDP offer for WebRTC negotiation. */
export interface EmulatorWebRTCOffer {
  type: "emulator_webrtc_offer";
  sessionId: string;
  sdp: string;
}

/** Server sends an ICE candidate (trickle ICE). */
export interface EmulatorICECandidateEvent {
  type: "emulator_ice_candidate_event";
  sessionId: string;
  /** null = end-of-candidates signal */
  candidate: RTCIceCandidateInit | null;
}

/** Server sends streaming session state change. */
export interface EmulatorSessionState {
  type: "emulator_session_state";
  sessionId: string;
  state: "connecting" | "connected" | "disconnected" | "failed";
  error?: string;
}

/** Union of all server→client emulator messages */
export type EmulatorServerMessage =
  | EmulatorWebRTCOffer
  | EmulatorICECandidateEvent
  | EmulatorSessionState;

// ============================================================================
// RTCIceCandidateInit shim (for environments without WebRTC globals)
// ============================================================================

/**
 * Minimal RTCIceCandidateInit for server-side use.
 * This avoids depending on DOM types in Node.
 */
export interface RTCIceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
