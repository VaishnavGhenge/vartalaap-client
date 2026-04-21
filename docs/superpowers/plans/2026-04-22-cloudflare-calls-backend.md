# Vartalaap Backend (Cloudflare Calls) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive Vartalaap by adding a lightweight Go signaling server that brokers WebRTC sessions via Cloudflare Calls (SFU), and migrate the Next.js client off `simple-peer` / `socket.io` to native `RTCPeerConnection` + raw WebSocket.

**Architecture:**
- Go server at `~/projects/vartalaap/vartalaap-server` handles (a) WebSocket signaling between clients in a room, and (b) server-side proxy to Cloudflare Calls' HTTP API so the CF bearer token never reaches the browser.
- Client opens one `RTCPeerConnection` to Cloudflare, publishes local tracks, subscribes to other participants' track IDs. Our server tells the client which track IDs to pull when peers join/leave.
- Anonymous join (no auth yet). On-demand rooms, destroyed when empty. No DB. No tests for this iteration — user confirms each phase works manually.

**Tech Stack:**
- Backend: Go 1.22+, stdlib `net/http`, `github.com/coder/websocket` (only dep besides stdlib).
- Frontend: Next.js 15 / React 19 (existing) — native `RTCPeerConnection`, raw `WebSocket`.
- Infra: Cloudflare Calls (managed SFU), 1GB VM (Caddy for TLS termination, systemd for the service).

**Confirmation checkpoints:** User manually verifies each Phase's end state before the next Phase begins. Do NOT proceed past a phase boundary without explicit "✅ works, continue" from the user.

---

## Phase 0: Preflight

### Task 0.1: Create backend directory and init Go module

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/go.mod`
- Create: `~/projects/vartalaap/vartalaap-server/.gitignore`
- Create: `~/projects/vartalaap/vartalaap-server/README.md`

- [ ] **Step 1: Create directory and init module**

```bash
mkdir -p ~/projects/vartalaap/vartalaap-server
cd ~/projects/vartalaap/vartalaap-server
go mod init github.com/vaishnavghenge/vartalaap-server
git init
```

- [ ] **Step 2: Add WebSocket dependency**

```bash
go get github.com/coder/websocket@latest
```

- [ ] **Step 3: Write `.gitignore`**

```
/vartalaap
/dist/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 4: Minimal README.md**

```markdown
# vartalaap-server

Go signaling server for Vartalaap. Proxies WebRTC sessions via Cloudflare Calls.
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: init vartalaap-server module"
```

### Task 0.2: Create Cloudflare Calls app and capture credentials

This is a manual one-time step. Do not hardcode secrets.

- [ ] **Step 1: Create CF Calls app**

In the Cloudflare dashboard → Calls → Create App. Name it `vartalaap-dev`.

- [ ] **Step 2: Copy the App ID and App Secret/Token**

Save them in a local `.env` file (NOT committed):

```bash
# ~/projects/vartalaap/vartalaap-server/.env
CF_CALLS_APP_ID=<your-app-id>
CF_CALLS_APP_TOKEN=<your-app-token>
PORT=8080
ALLOWED_ORIGINS=http://localhost:3000
```

Verify `.env` is listed in `.gitignore` (Task 0.1 Step 3 already adds it).

### Task 0.3: Pin Cloudflare Calls API shape

The CF Calls HTTP API is a beta product with occasional changes. Before writing code in Phase 2, capture the current request/response shapes so the plan's code is accurate at implementation time.

- [ ] **Step 1: Fetch current docs**

Read https://developers.cloudflare.com/calls/ and the OpenAPI/TypeScript examples. Record in a local notes file:
- Base URL for the REST API
- Auth header format (`Authorization: Bearer <token>`?)
- Endpoint paths and request/response bodies for:
  - Create a new session
  - Add a track to a session (both publish and pull/subscribe)
  - Renegotiate (applying a remote answer)
  - Close tracks / close session

- [ ] **Step 2: Save notes**

Create `~/projects/vartalaap/vartalaap-server/docs/cf-calls-api.md` with the captured shapes. This is the source of truth for Phase 2 code — if the plan's examples disagree with your notes, trust your notes.

### Phase 0 Checkpoint

User confirms:
- [ ] `vartalaap-server` repo exists and builds (`go build ./...` — no-op for now)
- [ ] CF Calls app created, credentials in `.env`
- [ ] `docs/cf-calls-api.md` written with current endpoint shapes

---

## Phase 1: Go Signaling Server (no CF yet)

Build a working WebSocket signaling server that handles rooms, join/leave, and generic message forwarding. We wire CF Calls into it in Phase 2. Phase 1 ends with two `wscat` clients successfully joining a room and seeing each other's join/leave events.

### File Structure

```
vartalaap-server/
  cmd/server/main.go          # entrypoint, config load, http.ListenAndServe
  internal/
    config/config.go          # env loading
    signaling/
      message.go              # wire types + JSON (de)serialization
      client.go               # per-connection read/write pumps
      room.go                 # Room struct, member set
      hub.go                  # rooms registry + broadcast helpers
      handler.go              # http.HandlerFunc for /ws upgrade
  go.mod
  go.sum
  .env.example
```

### Task 1.1: Config loader

**Files:**
- Create: `internal/config/config.go`

- [ ] **Step 1: Write config loader**

```go
package config

import (
	"log"
	"os"
	"strings"
)

type Config struct {
	Port             string
	AllowedOrigins   []string
	CFCallsAppID     string
	CFCallsAppToken  string
}

func Load() Config {
	cfg := Config{
		Port:            getenv("PORT", "8080"),
		AllowedOrigins:  splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:3000")),
		CFCallsAppID:    os.Getenv("CF_CALLS_APP_ID"),
		CFCallsAppToken: os.Getenv("CF_CALLS_APP_TOKEN"),
	}
	if cfg.CFCallsAppID == "" || cfg.CFCallsAppToken == "" {
		log.Println("WARN: CF_CALLS_APP_ID / CF_CALLS_APP_TOKEN not set — CF Calls proxy will fail")
	}
	return cfg
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
```

- [ ] **Step 2: Commit**

```bash
git add internal/config
git commit -m "feat(config): env-based config loader"
```

### Task 1.2: Wire protocol types

**Files:**
- Create: `internal/signaling/message.go`

The wire protocol is one JSON envelope, discriminated by `type`. Messages that flow in Phase 1:

| Direction | type | purpose |
|---|---|---|
| s→c | `welcome` | Server assigns peer ID on connect |
| c→s | `join` | Ask to join room |
| s→c | `joined` | Confirms join + sends current member list |
| s→c | `peer-joined` | Broadcast to existing members when someone joins |
| s→c | `peer-left` | Broadcast when a member disconnects or leaves |
| c→s | `leave` | Explicit leave (optional; close also leaves) |
| s→c | `error` | Server-side error |

- [ ] **Step 1: Write message types**

```go
package signaling

import "encoding/json"

type MsgType string

const (
	MsgWelcome    MsgType = "welcome"
	MsgJoin       MsgType = "join"
	MsgJoined     MsgType = "joined"
	MsgLeave      MsgType = "leave"
	MsgPeerJoined MsgType = "peer-joined"
	MsgPeerLeft   MsgType = "peer-left"
	MsgError      MsgType = "error"
)

type Envelope struct {
	Type MsgType         `json:"type"`
	Room string          `json:"room,omitempty"`
	From string          `json:"from,omitempty"`
	To   string          `json:"to,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type JoinedData struct {
	Peers []string `json:"peers"`
}

type PeerEventData struct {
	PeerID string `json:"peerId"`
}

type ErrorData struct {
	Message string `json:"message"`
}
```

- [ ] **Step 2: Commit**

```bash
git add internal/signaling/message.go
git commit -m "feat(signaling): wire protocol types"
```

### Task 1.3: Room and Client

**Files:**
- Create: `internal/signaling/room.go`
- Create: `internal/signaling/client.go`

- [ ] **Step 1: Write `room.go`**

```go
package signaling

import "sync"

type Room struct {
	id      string
	mu      sync.RWMutex
	members map[string]*Client // peerID -> Client
}

func newRoom(id string) *Room {
	return &Room{id: id, members: make(map[string]*Client)}
}

func (r *Room) add(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.members[c.id] = c
}

func (r *Room) remove(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.members, peerID)
}

func (r *Room) empty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.members) == 0
}

func (r *Room) peerIDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.members))
	for id := range r.members {
		ids = append(ids, id)
	}
	return ids
}

func (r *Room) broadcastExcept(exceptID string, payload []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, c := range r.members {
		if id == exceptID {
			continue
		}
		select {
		case c.send <- payload:
		default:
			// Slow consumer; drop. writePump will close on its own.
		}
	}
}
```

- [ ] **Step 2: Write `client.go`**

```go
package signaling

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/coder/websocket"
)

type Client struct {
	id   string
	conn *websocket.Conn
	hub  *Hub
	send chan []byte
	room string
}

func (c *Client) writePump(ctx context.Context) {
	defer c.conn.Close(websocket.StatusNormalClosure, "")
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Write(writeCtx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump(ctx context.Context) {
	defer c.hub.leaveAll(c)
	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		var env Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			c.sendError("invalid JSON")
			continue
		}
		c.handle(&env)
	}
}

func (c *Client) handle(env *Envelope) {
	switch env.Type {
	case MsgJoin:
		if env.Room == "" {
			c.sendError("join requires room")
			return
		}
		c.hub.join(c, env.Room)
	case MsgLeave:
		c.hub.leaveAll(c)
	default:
		// Phase 2 will extend: "publish", "subscribe", etc.
		c.sendError("unknown message type: " + string(env.Type))
	}
}

func (c *Client) sendJSON(env *Envelope) {
	b, err := json.Marshal(env)
	if err != nil {
		log.Printf("marshal error: %v", err)
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

func (c *Client) sendError(msg string) {
	data, _ := json.Marshal(ErrorData{Message: msg})
	c.sendJSON(&Envelope{Type: MsgError, Data: data})
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/signaling/room.go internal/signaling/client.go
git commit -m "feat(signaling): Room and Client with read/write pumps"
```

### Task 1.4: Hub and HTTP handler

**Files:**
- Create: `internal/signaling/hub.go`
- Create: `internal/signaling/handler.go`

- [ ] **Step 1: Write `hub.go`**

```go
package signaling

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"sync"
)

type Hub struct {
	mu    sync.Mutex
	rooms map[string]*Room
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*Room)}
}

func (h *Hub) join(c *Client, roomID string) {
	h.mu.Lock()
	// If client was in a different room, leave it first.
	if c.room != "" && c.room != roomID {
		if old, ok := h.rooms[c.room]; ok {
			old.remove(c.id)
			h.gcRoomLocked(old)
		}
	}
	room, ok := h.rooms[roomID]
	if !ok {
		room = newRoom(roomID)
		h.rooms[roomID] = room
	}
	// Snapshot existing peer IDs BEFORE adding self.
	existing := room.peerIDs()
	room.add(c)
	c.room = roomID
	h.mu.Unlock()

	// Tell the joiner who is already in the room.
	joinedData, _ := json.Marshal(JoinedData{Peers: existing})
	c.sendJSON(&Envelope{Type: MsgJoined, Room: roomID, Data: joinedData})

	// Tell existing members that a new peer joined.
	evt, _ := json.Marshal(PeerEventData{PeerID: c.id})
	payload, _ := json.Marshal(Envelope{Type: MsgPeerJoined, Room: roomID, From: c.id, Data: evt})
	room.broadcastExcept(c.id, payload)
}

func (h *Hub) leaveAll(c *Client) {
	h.mu.Lock()
	roomID := c.room
	if roomID == "" {
		h.mu.Unlock()
		return
	}
	c.room = ""
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.Unlock()
		return
	}
	room.remove(c.id)
	h.gcRoomLocked(room)
	h.mu.Unlock()

	evt, _ := json.Marshal(PeerEventData{PeerID: c.id})
	payload, _ := json.Marshal(Envelope{Type: MsgPeerLeft, Room: roomID, From: c.id, Data: evt})
	room.broadcastExcept(c.id, payload)
}

// Must be called with h.mu held.
func (h *Hub) gcRoomLocked(r *Room) {
	if r.empty() {
		delete(h.rooms, r.id)
	}
}

func newPeerID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
```

- [ ] **Step 2: Write `handler.go`**

```go
package signaling

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"

	"github.com/coder/websocket"
)

func NewHandler(hub *Hub, allowedOrigins []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: originHosts(allowedOrigins),
		})
		if err != nil {
			return
		}

		c := &Client{
			id:   newPeerID(),
			conn: conn,
			hub:  hub,
			send: make(chan []byte, 32),
		}

		// Announce assigned peer ID.
		welcome, _ := json.Marshal(Envelope{Type: MsgWelcome, From: c.id})
		c.send <- welcome

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		go c.writePump(ctx)
		c.readPump(ctx) // blocks until connection ends
	}
}

func originHosts(origins []string) []string {
	// coder/websocket OriginPatterns matches the Host header, not the full URL.
	// Strip scheme so "http://localhost:3000" becomes "localhost:3000".
	hosts := make([]string, 0, len(origins))
	for _, o := range origins {
		host := o
		for _, p := range []string{"http://", "https://", "ws://", "wss://"} {
			host = stripPrefix(host, p)
		}
		hosts = append(hosts, host)
	}
	slices.Sort(hosts)
	return slices.Compact(hosts)
}

func stripPrefix(s, p string) string {
	if len(s) >= len(p) && s[:len(p)] == p {
		return s[len(p):]
	}
	return s
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/signaling/hub.go internal/signaling/handler.go
git commit -m "feat(signaling): Hub with join/leave + WS handler"
```

### Task 1.5: Entrypoint

**Files:**
- Create: `cmd/server/main.go`

- [ ] **Step 1: Write `main.go`**

```go
package main

import (
	"log"
	"net/http"
	"time"

	"github.com/vaishnavghenge/vartalaap-server/internal/config"
	"github.com/vaishnavghenge/vartalaap-server/internal/signaling"
)

func main() {
	cfg := config.Load()
	hub := signaling.NewHub()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws", signaling.NewHandler(hub, cfg.AllowedOrigins))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("vartalaap-server listening on :%s", cfg.Port)
	log.Fatal(srv.ListenAndServe())
}
```

- [ ] **Step 2: Build**

```bash
go build ./...
```

Expected: no output (success).

- [ ] **Step 3: Run**

```bash
PORT=8080 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server
```

Expected log: `vartalaap-server listening on :8080`

- [ ] **Step 4: Smoke test with wscat**

In two terminals (install wscat with `npm i -g wscat` if needed):

Terminal A:
```bash
wscat -c ws://localhost:8080/ws
> {"type":"join","room":"test"}
```
Expect to see `{"type":"welcome","from":"..."}` then `{"type":"joined","room":"test","data":{"peers":[]}}`.

Terminal B:
```bash
wscat -c ws://localhost:8080/ws
> {"type":"join","room":"test"}
```
Terminal B sees `joined` with A's peer ID in `peers`. Terminal A receives `peer-joined` with B's peer ID.

Close Terminal B. Terminal A sees `peer-left` with B's peer ID.

- [ ] **Step 5: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat: HTTP entrypoint + /ws + /healthz"
```

### Phase 1 Checkpoint

User runs Step 4 manually and confirms:
- [ ] Two `wscat` sessions see each other's join/leave events
- [ ] Server logs show clean connect/disconnect
- [ ] Closing terminal B cleans up correctly (no panic, no goroutine leak per `go tool pprof` if curious)

**STOP. Do not start Phase 2 until user confirms.**

---

## Phase 2: Cloudflare Calls Proxy

Add publish/subscribe message types and a server-side CF Calls client. The browser never holds the CF app token.

### High-Level Flow

1. Client joins a room (existing `join` from Phase 1).
2. Client creates a local `RTCPeerConnection`, adds its mic/camera tracks, generates an SDP offer.
3. Client sends `{type:"publish", data:{sdp:<offer>}}` to our server.
4. Server calls CF Calls REST API:
   - Create session (if not already created for this client) → gets `sessionId`.
   - Add tracks (new local) with the SDP offer → gets back SDP answer + `trackName`s.
5. Server responds `{type:"published", data:{sdp:<answer>, tracks:[{name, sessionId}]}}` to the publisher.
6. Server broadcasts `{type:"tracks-available", from:<peerId>, data:{tracks:[{name, sessionId}]}}` to other room members.
7. Other members send `{type:"subscribe", data:{tracks:[...]}}`. Server calls CF Calls "add tracks" on the subscriber's session with `{location:"remote", sessionId, trackName}`. Gets an SDP offer from CF. Forwards to client.
8. Client applies offer, returns answer. Client sends `{type:"renegotiate", data:{sdp:<answer>}}`. Server forwards to CF.

**Exact request/response bodies come from `docs/cf-calls-api.md` written in Task 0.3.** The code sketches below assume a generic shape — adjust to match the pinned spec.

### Task 2.1: CF Calls HTTP client

**Files:**
- Create: `internal/cfcalls/client.go`

- [ ] **Step 1: Write the CF Calls client skeleton**

```go
package cfcalls

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	appID     string
	appToken  string
	baseURL   string // typically "https://rtc.live.cloudflare.com/v1"
	http      *http.Client
}

func New(appID, appToken string) *Client {
	return &Client{
		appID:    appID,
		appToken: appToken,
		baseURL:  "https://rtc.live.cloudflare.com/v1",
		http:     &http.Client{Timeout: 15 * time.Second},
	}
}

type SDP struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

type TrackInfo struct {
	Location  string `json:"location,omitempty"`  // "local" | "remote"
	Mid       string `json:"mid,omitempty"`
	TrackName string `json:"trackName,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

// NewSession creates a CF Calls session for a single browser peer.
// Returns the sessionId.
func (c *Client) NewSession(ctx context.Context) (string, error) {
	var resp struct {
		SessionID string `json:"sessionId"`
	}
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/apps/%s/sessions/new", c.appID), nil, &resp); err != nil {
		return "", err
	}
	return resp.SessionID, nil
}

// AddLocalTracks publishes tracks from the client to CF. The client has already
// generated an SDP offer with its tracks attached.
func (c *Client) AddLocalTracks(ctx context.Context, sessionID string, offer SDP, tracks []TrackInfo) (answer SDP, out []TrackInfo, err error) {
	body := map[string]any{
		"sessionDescription": offer,
		"tracks":             tracks, // each with Location:"local", Mid, TrackName
	}
	var resp struct {
		SessionDescription SDP         `json:"sessionDescription"`
		Tracks             []TrackInfo `json:"tracks"`
	}
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/apps/%s/sessions/%s/tracks/new", c.appID, sessionID), body, &resp); err != nil {
		return SDP{}, nil, err
	}
	return resp.SessionDescription, resp.Tracks, nil
}

// AddRemoteTracks subscribes the session to remote tracks from another session.
// Returns an SDP offer from CF that the client must answer.
func (c *Client) AddRemoteTracks(ctx context.Context, sessionID string, remotes []TrackInfo) (offer SDP, out []TrackInfo, err error) {
	body := map[string]any{
		"tracks": remotes, // each with Location:"remote", SessionID, TrackName
	}
	var resp struct {
		SessionDescription SDP         `json:"sessionDescription"`
		Tracks             []TrackInfo `json:"tracks"`
		RequiresImmediateRenegotiation bool `json:"requiresImmediateRenegotiation"`
	}
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/apps/%s/sessions/%s/tracks/new", c.appID, sessionID), body, &resp); err != nil {
		return SDP{}, nil, err
	}
	return resp.SessionDescription, resp.Tracks, nil
}

// Renegotiate sends the client's answer back to CF after a remote-track offer.
func (c *Client) Renegotiate(ctx context.Context, sessionID string, answer SDP) error {
	body := map[string]any{"sessionDescription": answer}
	return c.do(ctx, http.MethodPut, fmt.Sprintf("/apps/%s/sessions/%s/renegotiate", c.appID, sessionID), body, nil)
}

func (c *Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.appToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("cf calls %s %s: %d %s", method, path, resp.StatusCode, string(b))
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}
```

**IMPORTANT:** Before committing, cross-check every endpoint path, request field, and response field against `docs/cf-calls-api.md` from Task 0.3. Rename fields as needed. The skeleton above reflects CF Calls' public shape as of late 2025 but is not authoritative.

- [ ] **Step 2: Build and commit**

```bash
go build ./...
git add internal/cfcalls
git commit -m "feat(cfcalls): HTTP client for Cloudflare Calls API"
```

### Task 2.2: Extend wire protocol

**Files:**
- Modify: `internal/signaling/message.go`

- [ ] **Step 1: Add new message types**

Append to the `const (...)` block:

```go
const (
	// ... existing types ...

	MsgPublish          MsgType = "publish"          // c→s: here's my offer + my tracks
	MsgPublished        MsgType = "published"        // s→c: CF's answer + assigned track names
	MsgTracksAvailable  MsgType = "tracks-available" // s→c broadcast: peer X exposes tracks [...]
	MsgSubscribe        MsgType = "subscribe"        // c→s: I want to pull these track names from these peers
	MsgSubscribed       MsgType = "subscribed"       // s→c: CF's offer, apply it then send `renegotiate`
	MsgRenegotiate      MsgType = "renegotiate"      // c→s: my answer to CF's offer
)
```

Add data structs:

```go
type PublishData struct {
	SDP SDP `json:"sdp"`
	Tracks []TrackRef `json:"tracks"` // client-side: mid + trackName hint (client generates a UUID-ish name)
}

type PublishedData struct {
	SDP SDP `json:"sdp"`
	Tracks []TrackRef `json:"tracks"`
}

type TracksAvailableData struct {
	PeerID string     `json:"peerId"`
	Tracks []TrackRef `json:"tracks"`
}

type SubscribeData struct {
	Tracks []RemoteTrackRef `json:"tracks"`
}

type SubscribedData struct {
	SDP SDP `json:"sdp"`
	Tracks []TrackRef `json:"tracks"`
}

type RenegotiateData struct {
	SDP SDP `json:"sdp"`
}

type SDP struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

type TrackRef struct {
	Mid       string `json:"mid,omitempty"`
	TrackName string `json:"trackName"`
}

type RemoteTrackRef struct {
	PeerID    string `json:"peerId"`    // which peer
	TrackName string `json:"trackName"` // which track
}
```

- [ ] **Step 2: Commit**

```bash
git add internal/signaling/message.go
git commit -m "feat(signaling): add publish/subscribe wire types"
```

### Task 2.3: Per-client CF session tracking

**Files:**
- Modify: `internal/signaling/client.go`
- Modify: `internal/signaling/hub.go`

The hub needs to hold a map `peerID → cfSessionID` and `peerID → []publishedTracks` so it can tell new joiners about existing tracks.

- [ ] **Step 1: Extend `Client` with CF session fields**

In `client.go`, add to the `Client` struct:

```go
type Client struct {
	id       string
	conn     *websocket.Conn
	hub      *Hub
	send     chan []byte
	room     string

	// CF Calls state
	cfSessionID string
	published   []TrackRef
}
```

- [ ] **Step 2: Extend `Hub` with CF client reference**

In `hub.go`:

```go
type Hub struct {
	mu     sync.Mutex
	rooms  map[string]*Room
	cf     *cfcalls.Client
}

func NewHub(cf *cfcalls.Client) *Hub {
	return &Hub{rooms: make(map[string]*Room), cf: cf}
}
```

- [ ] **Step 3: Update `main.go` to pass the CF client**

```go
cf := cfcalls.New(cfg.CFCallsAppID, cfg.CFCallsAppToken)
hub := signaling.NewHub(cf)
```

Add import:
```go
"github.com/vaishnavghenge/vartalaap-server/internal/cfcalls"
```

- [ ] **Step 4: Build**

```bash
go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(signaling): wire CF Calls client into Hub"
```

### Task 2.4: Handle publish/subscribe/renegotiate

**Files:**
- Modify: `internal/signaling/client.go`
- Modify: `internal/signaling/hub.go`

- [ ] **Step 1: Extend `handle` in `client.go`**

```go
func (c *Client) handle(env *Envelope) {
	switch env.Type {
	case MsgJoin:
		if env.Room == "" {
			c.sendError("join requires room")
			return
		}
		c.hub.join(c, env.Room)
	case MsgLeave:
		c.hub.leaveAll(c)
	case MsgPublish:
		var data PublishData
		if err := json.Unmarshal(env.Data, &data); err != nil {
			c.sendError("invalid publish data")
			return
		}
		c.hub.publish(c, data)
	case MsgSubscribe:
		var data SubscribeData
		if err := json.Unmarshal(env.Data, &data); err != nil {
			c.sendError("invalid subscribe data")
			return
		}
		c.hub.subscribe(c, data)
	case MsgRenegotiate:
		var data RenegotiateData
		if err := json.Unmarshal(env.Data, &data); err != nil {
			c.sendError("invalid renegotiate data")
			return
		}
		c.hub.renegotiate(c, data)
	default:
		c.sendError("unknown message type: " + string(env.Type))
	}
}
```

- [ ] **Step 2: Add hub methods**

In `hub.go`:

```go
func (h *Hub) publish(c *Client, data PublishData) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if c.cfSessionID == "" {
		sessID, err := h.cf.NewSession(ctx)
		if err != nil {
			c.sendError("cf new session: " + err.Error())
			return
		}
		c.cfSessionID = sessID
	}

	// Convert our TrackRef to cfcalls.TrackInfo.
	cfTracks := make([]cfcalls.TrackInfo, 0, len(data.Tracks))
	for _, t := range data.Tracks {
		cfTracks = append(cfTracks, cfcalls.TrackInfo{
			Location:  "local",
			Mid:       t.Mid,
			TrackName: t.TrackName,
		})
	}

	answer, out, err := h.cf.AddLocalTracks(ctx,
		c.cfSessionID,
		cfcalls.SDP{Type: data.SDP.Type, SDP: data.SDP.SDP},
		cfTracks,
	)
	if err != nil {
		c.sendError("cf add local: " + err.Error())
		return
	}

	// Remember for late-joiners.
	tracks := make([]TrackRef, 0, len(out))
	for _, t := range out {
		tracks = append(tracks, TrackRef{Mid: t.Mid, TrackName: t.TrackName})
	}
	c.published = append(c.published, tracks...)

	// Reply to publisher.
	respData, _ := json.Marshal(PublishedData{
		SDP:    SDP{Type: answer.Type, SDP: answer.SDP},
		Tracks: tracks,
	})
	c.sendJSON(&Envelope{Type: MsgPublished, Data: respData})

	// Broadcast to room.
	h.mu.Lock()
	room := h.rooms[c.room]
	h.mu.Unlock()
	if room == nil {
		return
	}
	evtData, _ := json.Marshal(TracksAvailableData{PeerID: c.id, Tracks: tracks})
	payload, _ := json.Marshal(Envelope{Type: MsgTracksAvailable, Room: c.room, From: c.id, Data: evtData})
	room.broadcastExcept(c.id, payload)
}

func (h *Hub) subscribe(c *Client, data SubscribeData) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if c.cfSessionID == "" {
		sessID, err := h.cf.NewSession(ctx)
		if err != nil {
			c.sendError("cf new session: " + err.Error())
			return
		}
		c.cfSessionID = sessID
	}

	// Translate PeerID → cfSessionID.
	h.mu.Lock()
	room := h.rooms[c.room]
	h.mu.Unlock()
	if room == nil {
		c.sendError("not in a room")
		return
	}

	remotes := make([]cfcalls.TrackInfo, 0, len(data.Tracks))
	for _, ref := range data.Tracks {
		room.mu.RLock()
		other, ok := room.members[ref.PeerID]
		room.mu.RUnlock()
		if !ok || other.cfSessionID == "" {
			continue
		}
		remotes = append(remotes, cfcalls.TrackInfo{
			Location:  "remote",
			SessionID: other.cfSessionID,
			TrackName: ref.TrackName,
		})
	}
	if len(remotes) == 0 {
		c.sendError("no matching tracks")
		return
	}

	offer, out, err := h.cf.AddRemoteTracks(ctx, c.cfSessionID, remotes)
	if err != nil {
		c.sendError("cf add remote: " + err.Error())
		return
	}

	tracks := make([]TrackRef, 0, len(out))
	for _, t := range out {
		tracks = append(tracks, TrackRef{Mid: t.Mid, TrackName: t.TrackName})
	}
	respData, _ := json.Marshal(SubscribedData{
		SDP:    SDP{Type: offer.Type, SDP: offer.SDP},
		Tracks: tracks,
	})
	c.sendJSON(&Envelope{Type: MsgSubscribed, Data: respData})
}

func (h *Hub) renegotiate(c *Client, data RenegotiateData) {
	if c.cfSessionID == "" {
		c.sendError("no cf session")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := h.cf.Renegotiate(ctx, c.cfSessionID, cfcalls.SDP{Type: data.SDP.Type, SDP: data.SDP.SDP}); err != nil {
		c.sendError("cf renegotiate: " + err.Error())
	}
}
```

Add imports to `hub.go`:
```go
import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/vaishnavghenge::vartalaap-server/internal/cfcalls"
)
```

(Fix the import path to `github.com/vaishnavghenge/vartalaap-server/internal/cfcalls`.)

- [ ] **Step 3: Tell late-joiners about already-published tracks**

Modify `join` in `hub.go` to send `tracks-available` for each existing member after the `joined` message:

```go
// After sending MsgJoined, tell the new joiner about existing tracks.
for _, peerID := range existing {
	room.mu.RLock()
	other := room.members[peerID]
	room.mu.RUnlock()
	if other == nil || len(other.published) == 0 {
		continue
	}
	evtData, _ := json.Marshal(TracksAvailableData{PeerID: peerID, Tracks: other.published})
	c.sendJSON(&Envelope{Type: MsgTracksAvailable, Room: roomID, From: peerID, Data: evtData})
}
```

- [ ] **Step 4: Build**

```bash
go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(signaling): publish/subscribe/renegotiate against CF Calls"
```

### Phase 2 Checkpoint

Phase 2 ends without a meaningful manual smoke test on the backend alone — the client is the simplest test harness. So the checkpoint is:

- [ ] `go build ./...` succeeds
- [ ] Server starts with real `CF_CALLS_APP_ID` / `CF_CALLS_APP_TOKEN` and logs no warnings
- [ ] Endpoints from `docs/cf-calls-api.md` match the code

**STOP. Do not start Phase 3 until user confirms.**

---

## Phase 3: Client Migration

Rip out `simple-peer` and `socket.io-client`. Replace with a thin WebSocket transport plus a CF Calls–aware peer layer built on native `RTCPeerConnection`.

### Target File Structure (client)

```
src/
  services/
    socket/
      socket.ts              # DELETE
    signaling/
      client.ts              # NEW: WebSocket transport (typed)
      protocol.ts            # NEW: wire types mirroring Go server
  stores/
    peer.ts                  # REWRITE: CF Calls session + RTCPeerConnection mgmt
  hooks/
    use-socket.ts            # RENAME → use-signaling.ts (updated)
    use-call.ts              # NEW: orchestrates join → publish → subscribe
  components/features/
    MeetCall.tsx             # MODIFY: consume new store/hook
```

### Task 3.1: Remove old deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall**

```bash
cd ~/projects/vartalaap/vartalaap-client
npm uninstall simple-peer @types/simple-peer socket.io socket.io-client @types/socket.io-client
```

Note: `socket.io` (server) is also a dep in `package.json` — remove it too.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove simple-peer and socket.io deps"
```

### Task 3.2: Signaling wire types (client mirror of Go)

**Files:**
- Create: `src/services/signaling/protocol.ts`

- [ ] **Step 1: Write types**

```typescript
export type MsgType =
  | 'welcome'
  | 'join'
  | 'joined'
  | 'leave'
  | 'peer-joined'
  | 'peer-left'
  | 'publish'
  | 'published'
  | 'tracks-available'
  | 'subscribe'
  | 'subscribed'
  | 'renegotiate'
  | 'error'

export interface Envelope<T = unknown> {
  type: MsgType
  room?: string
  from?: string
  to?: string
  data?: T
}

export interface SDP {
  type: 'offer' | 'answer'
  sdp: string
}

export interface TrackRef {
  mid?: string
  trackName: string
}

export interface RemoteTrackRef {
  peerId: string
  trackName: string
}

export interface JoinedData { peers: string[] }
export interface PeerEventData { peerId: string }
export interface PublishData { sdp: SDP; tracks: TrackRef[] }
export interface PublishedData { sdp: SDP; tracks: TrackRef[] }
export interface TracksAvailableData { peerId: string; tracks: TrackRef[] }
export interface SubscribeData { tracks: RemoteTrackRef[] }
export interface SubscribedData { sdp: SDP; tracks: TrackRef[] }
export interface RenegotiateData { sdp: SDP }
export interface ErrorData { message: string }
```

- [ ] **Step 2: Commit**

```bash
git add src/services/signaling/protocol.ts
git commit -m "feat(signaling): client wire types"
```

### Task 3.3: WebSocket transport

**Files:**
- Create: `src/services/signaling/client.ts`
- Delete: `src/services/socket/socket.ts`
- Modify: `src/services/api/config.ts`

- [ ] **Step 1: Update config**

```typescript
// src/services/api/config.ts
const serverDomain = process.env.NEXT_PUBLIC_SERVER_DOMAIN ?? 'localhost:8080'
const isSecure = process.env.NEXT_PUBLIC_SERVER_SECURE === 'true'

export const httpServerUri = `${isSecure ? 'https' : 'http'}://${serverDomain}`
export const wsServerUri = `${isSecure ? 'wss' : 'ws'}://${serverDomain}/ws`
```

- [ ] **Step 2: Write the WS client**

```typescript
// src/services/signaling/client.ts
import type { Envelope, MsgType } from './protocol'

type Handler = (env: Envelope) => void

export class SignalingClient {
  private ws: WebSocket | null = null
  private handlers = new Map<MsgType, Set<Handler>>()
  private url: string
  private peerId: string | null = null
  private welcomeResolvers: Array<(id: string) => void> = []

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws

      const onWelcome = (env: Envelope) => {
        this.peerId = env.from ?? null
        this.off('welcome', onWelcome)
        if (this.peerId) resolve(this.peerId)
        else reject(new Error('welcome missing peer id'))
      }
      this.on('welcome', onWelcome)

      ws.onmessage = (ev) => {
        try {
          const env = JSON.parse(ev.data) as Envelope
          const set = this.handlers.get(env.type)
          if (set) for (const h of set) h(env)
        } catch (err) {
          console.error('signaling: bad message', err)
        }
      }
      ws.onerror = (ev) => reject(new Error('ws error'))
      ws.onclose = () => {
        this.ws = null
        this.peerId = null
      }
    })
  }

  disconnect() {
    this.ws?.close()
  }

  send<T>(type: MsgType, data?: T, extra?: Partial<Envelope>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const env: Envelope = { type, ...extra, data: data as unknown }
    this.ws.send(JSON.stringify(env))
  }

  on(type: MsgType, handler: Handler) {
    let set = this.handlers.get(type)
    if (!set) { set = new Set(); this.handlers.set(type, set) }
    set.add(handler)
  }

  off(type: MsgType, handler: Handler) {
    this.handlers.get(type)?.delete(handler)
  }

  getPeerId() { return this.peerId }
}
```

- [ ] **Step 3: Delete old socket file**

```bash
rm src/services/socket/socket.ts
rmdir src/services/socket 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(signaling): raw WebSocket client, remove socket.io wrapper"
```

### Task 3.4: Rewrite peer store for CF Calls

**Files:**
- Modify: `src/stores/peer.ts` (full rewrite)

The new store holds:
- one `RTCPeerConnection` (to CF)
- local `MediaStream`
- map of `peerId → { trackName → MediaStreamTrack }` for remote peers
- helpers for publish / subscribe flows

- [ ] **Step 1: Write the new store**

```typescript
// src/stores/peer.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { SignalingClient } from '@/src/services/signaling/client'
import type {
  PublishedData, SubscribedData, TracksAvailableData, TrackRef,
} from '@/src/services/signaling/protocol'

interface RemotePeer {
  peerId: string
  stream: MediaStream
  trackNames: string[]
}

interface PeerState {
  pc: RTCPeerConnection | null
  localStream: MediaStream | null
  remotePeers: Map<string, RemotePeer>
  publishedTrackNames: string[] // our own

  initLocalMedia: () => Promise<MediaStream | null>
  stopLocalMedia: () => void

  // Establishes pc, sends publish to server, waits for published answer.
  publish: (sig: SignalingClient) => Promise<void>

  // Adds a remote track to an existing remotePeer or creates one.
  onTracksAvailable: (sig: SignalingClient, data: TracksAvailableData) => Promise<void>

  teardown: () => void
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => ({
    pc: null,
    localStream: null,
    remotePeers: new Map(),
    publishedTrackNames: [],

    initLocalMedia: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        set({ localStream: stream })
        return stream
      } catch (e) {
        console.error('getUserMedia failed', e)
        return null
      }
    },

    stopLocalMedia: () => {
      get().localStream?.getTracks().forEach(t => t.stop())
      set({ localStream: null })
    },

    publish: async (sig) => {
      const { localStream } = get()
      if (!localStream) throw new Error('no local stream')

      const pc = new RTCPeerConnection()
      set({ pc })

      // Add local tracks. Record their mid after createOffer.
      const trackNameByMid = new Map<string, string>()
      const senders = localStream.getTracks().map(t => {
        const sender = pc.addTransceiver(t, { direction: 'sendonly' })
        return sender
      })

      // Handle remote tracks (arrives when we later subscribe).
      pc.ontrack = (ev) => {
        // Associate by transceiver mid.
        const mid = ev.transceiver.mid
        if (!mid) return
        // Later Task 3.5 hook handles mapping mid → (peerId, trackName)
        // For now, stash on the store keyed by mid.
        attachIncomingTrack(set, get, mid, ev.track)
      }

      // Create offer, set local description.
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Now mids exist on transceivers. Build track list.
      const tracks: TrackRef[] = senders.map((s, i) => ({
        mid: s.mid ?? '',
        trackName: `${sig.getPeerId()}-${i}-${crypto.randomUUID().slice(0, 8)}`,
      }))
      tracks.forEach(t => trackNameByMid.set(t.mid!, t.trackName))

      // Send publish, await published response.
      await new Promise<void>((resolve, reject) => {
        const onPublished = async (env: { data?: PublishedData }) => {
          sig.off('published', onPublished as any)
          if (!env.data) return reject(new Error('published missing data'))
          await pc.setRemoteDescription({ type: 'answer', sdp: env.data.sdp.sdp })
          set({ publishedTrackNames: env.data.tracks.map(t => t.trackName) })
          resolve()
        }
        sig.on('published', onPublished as any)
        sig.send('publish', { sdp: offer, tracks })
      })
    },

    onTracksAvailable: async (sig, data) => {
      // Ask server to wire these remote tracks into our session.
      const pc = get().pc
      if (!pc) return

      const pending = new Promise<void>((resolve, reject) => {
        const onSubscribed = async (env: { data?: SubscribedData }) => {
          sig.off('subscribed', onSubscribed as any)
          if (!env.data) return reject(new Error('subscribed missing data'))
          await pc.setRemoteDescription({ type: 'offer', sdp: env.data.sdp.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sig.send('renegotiate', { sdp: answer })
          resolve()
        }
        sig.on('subscribed', onSubscribed as any)
        sig.send('subscribe', {
          tracks: data.tracks.map(t => ({ peerId: data.peerId, trackName: t.trackName })),
        })
      })
      await pending
    },

    teardown: () => {
      get().pc?.close()
      get().stopLocalMedia()
      set({ pc: null, remotePeers: new Map(), publishedTrackNames: [] })
    },
  }))
)

// Helper: keep incoming tracks organized by peer.
// For this iteration, we collapse everything into a single "remote" MediaStream
// keyed by trackName since the server broadcasts tracks-available with peerId.
// The simplest v1 approach: one MediaStream per peerId.
function attachIncomingTrack(
  set: (p: Partial<PeerState>) => void,
  get: () => PeerState,
  mid: string,
  track: MediaStreamTrack,
) {
  // For v1: we do NOT know which peer this mid belongs to purely from ontrack.
  // A full implementation carries that mapping back from the `subscribed` response
  // (which returns tracks with mids). For the first working version, aggregate all
  // remote tracks into a single "remote" stream so MeetCall can show *something*.
  const remotes = new Map(get().remotePeers)
  let p = remotes.get('remote')
  if (!p) {
    p = { peerId: 'remote', stream: new MediaStream(), trackNames: [] }
    remotes.set('remote', p)
  }
  p.stream.addTrack(track)
  p.trackNames.push(mid)
  set({ remotePeers: remotes })
}
```

**Known v1 limitation:** the `attachIncomingTrack` helper collapses all remote peers into a single tile labeled "remote". This is a known shortcut for the first working version; Task 3.7 adds proper per-peer attribution.

- [ ] **Step 2: Commit**

```bash
git add src/stores/peer.ts
git commit -m "feat(peer): rewrite store for CF Calls RTCPeerConnection"
```

### Task 3.5: Signaling hook

**Files:**
- Create: `src/hooks/use-signaling.ts`
- Delete: `src/hooks/use-socket.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/use-signaling.ts
import { useEffect, useRef, useState } from 'react'
import { SignalingClient } from '@/src/services/signaling/client'
import { wsServerUri } from '@/src/services/api/config'

export function useSignaling() {
  const ref = useRef<SignalingClient | null>(null)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const client = new SignalingClient(wsServerUri)
    ref.current = client
    let cancelled = false
    ;(async () => {
      try {
        const id = await client.connect()
        if (cancelled) { client.disconnect(); return }
        setPeerId(id)
        setConnected(true)
      } catch (e) {
        console.error('signaling connect failed', e)
      }
    })()
    return () => {
      cancelled = true
      client.disconnect()
      ref.current = null
    }
  }, [])

  return { client: ref.current, peerId, connected }
}
```

- [ ] **Step 2: Remove old hook**

```bash
rm src/hooks/use-socket.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(hooks): useSignaling replaces useSocket"
```

### Task 3.6: Call orchestration hook

**Files:**
- Create: `src/hooks/use-call.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/use-call.ts
import { useEffect } from 'react'
import { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import type { TracksAvailableData, PeerEventData } from '@/src/services/signaling/protocol'

interface Args {
  client: SignalingClient | null
  roomId: string
}

export function useCall({ client, roomId }: Args) {
  const { initLocalMedia, publish, onTracksAvailable, teardown } = usePeerStore()

  useEffect(() => {
    if (!client || !roomId) return
    let disposed = false

    const handleTracksAvailable = async (env: { data?: TracksAvailableData }) => {
      if (!env.data) return
      await onTracksAvailable(client, env.data)
    }

    const handlePeerLeft = (env: { data?: PeerEventData }) => {
      // v1: simplest behavior is to keep the merged remote tile as-is.
      // Task 3.7 will detach tracks cleanly per peer.
      console.log('peer left', env.data?.peerId)
    }

    ;(async () => {
      const stream = await initLocalMedia()
      if (disposed || !stream) return

      client.on('tracks-available', handleTracksAvailable as any)
      client.on('peer-left', handlePeerLeft as any)

      client.send('join', undefined, { room: roomId })
      await publish(client)
    })()

    return () => {
      disposed = true
      client.off('tracks-available', handleTracksAvailable as any)
      client.off('peer-left', handlePeerLeft as any)
      teardown()
    }
  }, [client, roomId])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-call.ts
git commit -m "feat(hooks): useCall orchestrates join + publish + subscribe"
```

### Task 3.7: Per-peer track attribution

The v1 in Task 3.4 merges all remote tracks into one tile. Fix that now by using the `subscribed` response's track list (which returns mids paired with trackNames) to map `mid → peerId`.

**Files:**
- Modify: `src/stores/peer.ts`

- [ ] **Step 1: Add mid→peerId map**

Update the store to keep a `midToPeerId: Map<string, string>`. Populate it inside `onTracksAvailable`'s `onSubscribed` handler, pairing each returned track's `mid` with the `peerId` we asked to subscribe to.

Replace the `attachIncomingTrack` helper body with:

```typescript
function attachIncomingTrack(
  set: (p: Partial<PeerState>) => void,
  get: () => PeerState,
  mid: string,
  track: MediaStreamTrack,
) {
  const peerId = get().midToPeerId.get(mid) ?? 'unknown'
  const remotes = new Map(get().remotePeers)
  let p = remotes.get(peerId)
  if (!p) {
    p = { peerId, stream: new MediaStream(), trackNames: [] }
    remotes.set(peerId, p)
  }
  p.stream.addTrack(track)
  p.trackNames.push(mid)
  set({ remotePeers: remotes })
}
```

Add to the store state:
```typescript
midToPeerId: Map<string, string>
```

Initialize it to `new Map()` in the create call and clear it in `teardown`.

In `onTracksAvailable`, after CF's answer arrives, populate:
```typescript
env.data.tracks.forEach((t, i) => {
  const mid = t.mid
  if (mid) get().midToPeerId.set(mid, data.peerId)
})
```

- [ ] **Step 2: Handle peer-left cleanup**

In `use-call.ts`, replace the `handlePeerLeft` body:

```typescript
const handlePeerLeft = (env: { data?: PeerEventData }) => {
  const peerId = env.data?.peerId
  if (!peerId) return
  const s = usePeerStore.getState()
  const remotes = new Map(s.remotePeers)
  const gone = remotes.get(peerId)
  gone?.stream.getTracks().forEach(t => t.stop())
  remotes.delete(peerId)
  usePeerStore.setState({ remotePeers: remotes })
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(peer): per-peer remote track attribution"
```

### Task 3.8: Wire into MeetCall component

**Files:**
- Modify: `src/components/features/MeetCall.tsx`

- [ ] **Step 1: Read current MeetCall**

(Already read in planning. The component uses `participants` from `useMeetStore` to render remote tiles. We want it to use `remotePeers` from `usePeerStore` instead.)

- [ ] **Step 2: Replace remote-tile source**

Update the map section. The full replacement for the `{participants.map(...)}` block:

```tsx
{Array.from(remotePeers.values()).map(rp => (
  <VideoTile
    key={rp.peerId}
    participant={{ id: rp.peerId, name: rp.peerId.slice(0, 6) }}
    stream={rp.stream}
  />
))}
```

Add to the imports:
```tsx
const { localStream, initializeCamera, stopCamera, remotePeers } = usePeerStore()
```

Wait — `initializeCamera` and `stopCamera` were renamed in the store rewrite (Task 3.4) to `initLocalMedia` and `stopLocalMedia`. Update the destructure and the calls:

```tsx
const { localStream, initLocalMedia, stopLocalMedia, remotePeers } = usePeerStore()

const handleCameraToggle = async () => {
  if (isVideoOff) await initLocalMedia()
  else stopLocalMedia()
  toggleVideo()
}
```

Also, the component needs to drive `useCall`. Pick up room id and signaling client in the page (`app/[meetCode]/page.tsx`) and pass through, OR call `useSignaling()` + `useCall()` directly inside `MeetCall`. Pick the latter for simplicity.

At the top of `MeetCall.tsx`:
```tsx
import { useSignaling } from '@/src/hooks/use-signaling'
import { useCall } from '@/src/hooks/use-call'
import { useParams } from 'next/navigation'
```

In the component body:
```tsx
const params = useParams<{ meetCode: string }>()
const { client } = useSignaling()
useCall({ client, roomId: params.meetCode })
```

- [ ] **Step 3: Make sure `VideoTile` accepts a real stream for remotes**

Read `src/components/ui/VideoTile.tsx` — if its remote branch only shows a placeholder (the old version passed `stream={null}` for remotes), update it to use the `stream` prop like the local branch does. Set `video.srcObject = stream` in a `useEffect`.

- [ ] **Step 4: Start the dev server and test in two browser tabs**

```bash
# terminal 1
cd ~/projects/vartalaap/vartalaap-server
source .env && PORT=8080 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server

# terminal 2
cd ~/projects/vartalaap/vartalaap-client
NEXT_PUBLIC_SERVER_DOMAIN=localhost:8080 npm run dev
```

Open `http://localhost:3000/testroom` in two browser windows (different profiles so they don't share mic). Grant mic+camera in both.

Expected:
- Each window sees its own tile immediately.
- Within a few seconds, each window sees the other window's tile with live video from CF.
- Closing one window removes the tile in the other.

- [ ] **Step 5: Commit**

```bash
git add src/components/features/MeetCall.tsx src/components/ui/VideoTile.tsx
git commit -m "feat(ui): wire MeetCall to CF Calls peer store"
```

### Phase 3 Checkpoint

User manually confirms:
- [ ] Two browser windows on `localhost:3000/<anyroom>` connect and see each other's video + audio
- [ ] Closing one window removes the tile in the other
- [ ] No console errors in either browser
- [ ] Server logs clean connect/disconnect

**STOP. Do not start Phase 4 until user confirms.**

---

## Phase 4: Deploy

### Task 4.1: Dockerfile (optional — skip if deploying as systemd binary)

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/Dockerfile`

- [ ] **Step 1: Multi-stage build**

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/vartalaap ./cmd/server

FROM scratch
COPY --from=build /out/vartalaap /vartalaap
EXPOSE 8080
ENTRYPOINT ["/vartalaap"]
```

- [ ] **Step 2: Build and verify size**

```bash
docker build -t vartalaap-server .
docker images vartalaap-server
```

Expected: image under 15MB.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore: Dockerfile for scratch image"
```

### Task 4.2: systemd unit (for bare VM deployment)

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/deploy/vartalaap.service`

- [ ] **Step 1: Write unit file**

```ini
[Unit]
Description=Vartalaap signaling server
After=network.target

[Service]
Type=simple
User=vartalaap
WorkingDirectory=/opt/vartalaap
EnvironmentFile=/opt/vartalaap/.env
ExecStart=/opt/vartalaap/vartalaap
Restart=always
RestartSec=5s
MemoryMax=128M

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Commit**

```bash
git add deploy/vartalaap.service
git commit -m "chore: systemd unit"
```

### Task 4.3: Deploy script / runbook

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/deploy/README.md`

- [ ] **Step 1: Write runbook**

```markdown
# Deploying vartalaap-server

## First-time setup on the VM

1. Create user: `sudo useradd -r -s /bin/false vartalaap`
2. Create dir: `sudo mkdir -p /opt/vartalaap && sudo chown vartalaap:vartalaap /opt/vartalaap`
3. Copy service file: `sudo cp deploy/vartalaap.service /etc/systemd/system/`
4. Create `.env` at `/opt/vartalaap/.env` with CF creds + `ALLOWED_ORIGINS=https://<your-vercel-domain>`
5. Reload: `sudo systemctl daemon-reload && sudo systemctl enable vartalaap`

## Each deploy

```bash
# On dev machine
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o vartalaap ./cmd/server
scp vartalaap vm:/tmp/
ssh vm "sudo mv /tmp/vartalaap /opt/vartalaap/vartalaap && sudo chmod +x /opt/vartalaap/vartalaap && sudo systemctl restart vartalaap"
```

## Caddy reverse proxy (handles TLS)

Add to `/etc/caddy/Caddyfile`:

```
signal.yourdomain.com {
    reverse_proxy localhost:8080
}
```

Then `sudo systemctl reload caddy`.

## Verify

```bash
curl https://signal.yourdomain.com/healthz
# → ok
```
```

- [ ] **Step 2: Commit**

```bash
git add deploy/README.md
git commit -m "docs: deploy runbook"
```

### Task 4.4: Update client production env

**Files:**
- Create: `~/projects/vartalaap/vartalaap-client/.env.production.local.example`

- [ ] **Step 1: Document prod env vars**

```
NEXT_PUBLIC_SERVER_DOMAIN=signal.yourdomain.com
NEXT_PUBLIC_SERVER_SECURE=true
```

- [ ] **Step 2: Set them in Vercel**

Vercel project → Settings → Environment Variables → add both.

- [ ] **Step 3: Redeploy and smoke test**

Push to main; after Vercel deploys, open the site in two browsers and verify a call works end-to-end over the public domain.

### Phase 4 Checkpoint

User confirms:
- [ ] Binary running on VM under systemd, RAM < 50MB
- [ ] Caddy serving `https://signal.yourdomain.com/healthz` → `ok`
- [ ] Vercel-deployed client connects to production signaling server
- [ ] Two-user call works end-to-end on public URLs

---

## Self-Review Notes

- **Spec coverage:** Anonymous join ✅ (no auth gate in `handle`). On-demand rooms ✅ (`gcRoomLocked`). No DB ✅. Skip tests ✅ (manual smoke at each phase). Client migration off `simple-peer`/`socket.io` ✅ (Tasks 3.1, 3.3). CF Calls as SFU ✅ (Phase 2).
- **Known unknowns that cannot be resolved in this plan:**
  - Exact CF Calls API field names — resolved by Task 0.3 before any CF code is written.
  - Whether `coder/websocket`'s `OriginPatterns` exactly matches host-only; worst case, swap to `InsecureSkipVerify: true` in dev and do origin check manually.
  - Whether `RTCPeerConnection` transceiver mids are stable across renegotiations on all browsers — if not, Task 3.7's mapping needs a refresh-on-renegotiate step. Flag if observed during Phase 3 smoke test.
- **Placeholders:** None — every code block is complete enough to copy-run, with the documented exception of CF Calls request bodies which explicitly defer to Task 0.3's captured spec.
