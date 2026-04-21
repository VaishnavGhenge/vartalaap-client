# Vartalaap Backend (TURN + Mesh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive Vartalaap with the fastest low-risk path to a working multi-party call: a lightweight Go signaling server, Cloudflare Calls **TURN** (not SFU) for NAT traversal, and minimal changes to the existing Next.js client (keep `simple-peer`, drop `socket.io-client`).

**Architecture:**
- **Go server** at `~/projects/vartalaap/vartalaap-server` does two jobs:
  1. WebSocket **signaling relay**: forwards opaque SDP/ICE blobs between peers in the same room, plus join/leave events.
  2. HTTP **ICE credentials endpoint** (`POST /ice-servers`): server calls Cloudflare's TURN API with its secret key, returns short-lived ICE server config to the browser. The CF API token never touches the browser.
- **Client** keeps `simple-peer` mesh topology. Each peer connects directly (via CF TURN when NAT blocks direct P2P) to every other peer in the room. Replaces `socket.io-client` with a tiny raw-WebSocket wrapper.
- Anonymous join. On-demand rooms, destroyed when empty. No DB. No tests for this iteration — user confirms each phase works manually.

**Mesh-topology constraint:** ≤4 participants per room works comfortably. Uplink bandwidth scales with N-1, so 5+ participants on a normal home connection will struggle. Acceptable for v1; v2 (SFU) is documented separately in `2026-04-22-cloudflare-calls-backend.md`.

**Tech Stack:**
- Backend: Go 1.22+, stdlib `net/http`, `github.com/coder/websocket` (only non-stdlib dep).
- Frontend: Next.js 15 / React 19 / `simple-peer` (existing) — no new deps, remove `socket.io-client` and `socket.io`.
- Infra: Cloudflare TURN, 1GB VM (Caddy for TLS, systemd for the service).

**Confirmation checkpoints:** User manually verifies each Phase's end state before the next Phase begins. Do NOT proceed past a phase boundary without explicit "✅ works, continue" from the user.

---

## Phase 0: Preflight

### Task 0.1: Create backend directory and init Go module

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/go.mod`
- Create: `~/projects/vartalaap/vartalaap-server/.gitignore`
- Create: `~/projects/vartalaap/vartalaap-server/README.md`

- [ ] **Step 1: Init module**

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

Go signaling server for Vartalaap. Provides WebSocket signaling relay and an ICE-credentials endpoint backed by Cloudflare TURN.
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: init vartalaap-server module"
```

### Task 0.2: Create Cloudflare TURN key and capture credentials

- [ ] **Step 1: Create TURN key**

Cloudflare dashboard → Calls → TURN → create key. Name it `vartalaap-dev`. Capture the key's **ID** and **API token** (token is shown once).

- [ ] **Step 2: Save in local `.env`**

```bash
# ~/projects/vartalaap/vartalaap-server/.env
CF_TURN_KEY_ID=<your-turn-key-id>
CF_TURN_API_TOKEN=<your-turn-api-token>
PORT=8080
ALLOWED_ORIGINS=http://localhost:3000
```

Verify `.env` is in `.gitignore` (it already is from Task 0.1).

### Task 0.3: Pin Cloudflare TURN credential-generation API shape

- [ ] **Step 1: Read current docs**

Read https://developers.cloudflare.com/calls/turn/ and the specific "Generate TURN credentials" endpoint (likely `POST /accounts/{account_id}/calls/turn_keys/{key_id}/credentials/generate`). Capture:
- Exact URL
- Auth header (`Authorization: Bearer <token>`)
- Request body shape (typically `{"ttl": <seconds>}`)
- Response shape (contains `iceServers` with `urls`, `username`, `credential`)

- [ ] **Step 2: Save notes**

Create `~/projects/vartalaap/vartalaap-server/docs/cf-turn-api.md` with the captured shapes — the source of truth for Task 2.1. Include one full request/response example.

### Phase 0 Checkpoint

- [ ] `vartalaap-server` repo exists, `go build ./...` succeeds (no-op)
- [ ] CF TURN key created, credentials in `.env`
- [ ] `docs/cf-turn-api.md` written with a working example request

---

## Phase 1: Go Signaling Server

Build a WebSocket signaling relay. Opaque forwarding — the server has no opinion on what's inside `signal` payloads. Phase 1 ends with two `wscat` clients exchanging a test signal blob.

### File Structure

```
vartalaap-server/
  cmd/server/main.go
  internal/
    config/config.go
    signaling/
      message.go
      client.go
      room.go
      hub.go
      handler.go
```

### Task 1.1: Config loader

**Files:**
- Create: `internal/config/config.go`

- [ ] **Step 1: Write `config.go`**

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
	CFTurnKeyID      string
	CFTurnAPIToken   string
}

func Load() Config {
	cfg := Config{
		Port:           getenv("PORT", "8080"),
		AllowedOrigins: splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:3000")),
		CFTurnKeyID:    os.Getenv("CF_TURN_KEY_ID"),
		CFTurnAPIToken: os.Getenv("CF_TURN_API_TOKEN"),
	}
	if cfg.CFTurnKeyID == "" || cfg.CFTurnAPIToken == "" {
		log.Println("WARN: CF_TURN_KEY_ID / CF_TURN_API_TOKEN not set — /ice-servers will fail")
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

### Task 1.2: Wire protocol

**Files:**
- Create: `internal/signaling/message.go`

Mesh signaling protocol — six message types:

| Dir | type | Purpose |
|---|---|---|
| s→c | `welcome` | Server assigns peer ID on connect |
| c→s | `join` | Ask to join room |
| s→c | `joined` | Confirms join + existing member list |
| s→c | `peer-joined` | Broadcast when new member arrives |
| s→c | `peer-left` | Broadcast on disconnect or leave |
| c→s, s→c | `signal` | Opaque SDP/ICE blob forwarded between two peers by `to`/`from` |
| s→c | `error` | Server-side error |

- [ ] **Step 1: Write `message.go`**

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
	MsgSignal     MsgType = "signal"
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
	members map[string]*Client
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

func (r *Room) get(peerID string) *Client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.members[peerID]
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
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Write(wctx, websocket.MessageText, msg)
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
	case MsgSignal:
		if env.To == "" {
			c.sendError("signal requires 'to'")
			return
		}
		c.hub.forwardSignal(c, env)
	default:
		c.sendError("unknown message type: " + string(env.Type))
	}
}

func (c *Client) sendJSON(env *Envelope) {
	b, err := json.Marshal(env)
	if err != nil {
		log.Printf("marshal: %v", err)
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
	if c.room != "" && c.room != roomID {
		if old, ok := h.rooms[c.room]; ok {
			old.remove(c.id)
			h.gcLocked(old)
		}
	}
	room, ok := h.rooms[roomID]
	if !ok {
		room = newRoom(roomID)
		h.rooms[roomID] = room
	}
	existing := room.peerIDs()
	room.add(c)
	c.room = roomID
	h.mu.Unlock()

	joinedData, _ := json.Marshal(JoinedData{Peers: existing})
	c.sendJSON(&Envelope{Type: MsgJoined, Room: roomID, Data: joinedData})

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
	h.gcLocked(room)
	h.mu.Unlock()

	evt, _ := json.Marshal(PeerEventData{PeerID: c.id})
	payload, _ := json.Marshal(Envelope{Type: MsgPeerLeft, Room: roomID, From: c.id, Data: evt})
	room.broadcastExcept(c.id, payload)
}

func (h *Hub) forwardSignal(from *Client, env *Envelope) {
	h.mu.Lock()
	room := h.rooms[from.room]
	h.mu.Unlock()
	if room == nil {
		from.sendError("not in a room")
		return
	}
	target := room.get(env.To)
	if target == nil {
		from.sendError("target peer not in room")
		return
	}
	out := Envelope{Type: MsgSignal, Room: from.room, From: from.id, To: env.To, Data: env.Data}
	b, _ := json.Marshal(out)
	select {
	case target.send <- b:
	default:
	}
}

// Must be called with h.mu held.
func (h *Hub) gcLocked(r *Room) {
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
	"strings"

	"github.com/coder/websocket"
)

func NewHandler(hub *Hub, allowedOrigins []string) http.HandlerFunc {
	hosts := originHosts(allowedOrigins)
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: hosts,
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
		welcome, _ := json.Marshal(Envelope{Type: MsgWelcome, From: c.id})
		c.send <- welcome

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		go c.writePump(ctx)
		c.readPump(ctx)
	}
}

func originHosts(origins []string) []string {
	hosts := make([]string, 0, len(origins))
	for _, o := range origins {
		h := o
		for _, p := range []string{"https://", "http://", "wss://", "ws://"} {
			h = strings.TrimPrefix(h, p)
		}
		hosts = append(hosts, h)
	}
	slices.Sort(hosts)
	return slices.Compact(hosts)
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/signaling/hub.go internal/signaling/handler.go
git commit -m "feat(signaling): Hub with join/leave/forward + WS handler"
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

- [ ] **Step 3: Smoke test with `wscat`**

```bash
# install if needed
npm i -g wscat
```

Terminal 1 — run server:
```bash
cd ~/projects/vartalaap/vartalaap-server
set -a; source .env; set +a
go run ./cmd/server
```

Terminal 2:
```bash
wscat -c ws://localhost:8080/ws
# expect: {"type":"welcome","from":"<peerA>"}
> {"type":"join","room":"test"}
# expect: {"type":"joined","room":"test","data":{"peers":[]}}
```

Terminal 3:
```bash
wscat -c ws://localhost:8080/ws
# expect: {"type":"welcome","from":"<peerB>"}
> {"type":"join","room":"test"}
# expect: {"type":"joined","room":"test","data":{"peers":["<peerA>"]}}
# Terminal 2 receives: {"type":"peer-joined","from":"<peerB>",...}
```

From Terminal 2, forward a fake signal to Terminal 3:
```
> {"type":"signal","to":"<peerB>","data":{"hello":"world"}}
# Terminal 3 receives: {"type":"signal","from":"<peerA>","to":"<peerB>","data":{"hello":"world"}}
```

Close Terminal 3. Terminal 2 receives `peer-left`.

- [ ] **Step 4: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat: HTTP entrypoint + /ws + /healthz"
```

### Phase 1 Checkpoint

User confirms:
- [ ] Smoke test in Step 3 works end-to-end (welcome, join, peer-joined, signal forward, peer-left)
- [ ] Closing a wscat tab cleans up without panics

**STOP. Do not start Phase 2 until user confirms.**

---

## Phase 2: ICE Credentials Endpoint

Add `POST /ice-servers` that mints short-lived TURN credentials by calling Cloudflare and returns an `iceServers` array the browser can pass directly to `new RTCPeerConnection({ iceServers })` or `new Peer({ config: { iceServers } })`.

### Task 2.1: Cloudflare TURN client

**Files:**
- Create: `internal/cfturn/client.go`

Use the exact endpoint URL, request body, and response shape captured in `docs/cf-turn-api.md` (Task 0.3). The sketch below is the common shape — replace field names with whatever the pinned spec says.

- [ ] **Step 1: Write `client.go`**

```go
package cfturn

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	keyID    string
	apiToken string
	baseURL  string
	http     *http.Client
}

func New(keyID, apiToken string) *Client {
	return &Client{
		keyID:    keyID,
		apiToken: apiToken,
		baseURL:  "https://rtc.live.cloudflare.com/v1",
		http:     &http.Client{Timeout: 10 * time.Second},
	}
}

type IceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

type CredentialsResponse struct {
	IceServers IceServer `json:"iceServers"`
}

// Generate returns an ICE server config with TTL in seconds.
// Endpoint path comes from cf-turn-api.md — adjust if different.
func (c *Client) Generate(ctx context.Context, ttlSeconds int) (CredentialsResponse, error) {
	body, _ := json.Marshal(map[string]int{"ttl": ttlSeconds})
	url := fmt.Sprintf("%s/turn/keys/%s/credentials/generate", c.baseURL, c.keyID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return CredentialsResponse{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return CredentialsResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return CredentialsResponse{}, fmt.Errorf("cf turn: %d %s", resp.StatusCode, string(b))
	}
	var out CredentialsResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return CredentialsResponse{}, err
	}
	return out, nil
}
```

**Before committing:** verify endpoint path, request body key names, and response shape against `docs/cf-turn-api.md`. Fix mismatches.

- [ ] **Step 2: Build and commit**

```bash
go build ./...
git add internal/cfturn
git commit -m "feat(cfturn): client for Cloudflare TURN credentials API"
```

### Task 2.2: `/ice-servers` HTTP handler with CORS

**Files:**
- Create: `internal/httpx/ice_handler.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Write handler**

```go
// internal/httpx/ice_handler.go
package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"time"

	"github.com/vaishnavghenge/vartalaap-server/internal/cfturn"
)

func NewIceHandler(cf *cfturn.Client, allowedOrigins []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(allowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()

		creds, err := cf.Generate(ctx, 3600) // 1 hour
		if err != nil {
			http.Error(w, "failed to mint credentials: "+err.Error(), http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"iceServers": []cfturn.IceServer{creds.IceServers},
		})
	}
}
```

- [ ] **Step 2: Wire into `main.go`**

Replace `main.go` body:

```go
package main

import (
	"log"
	"net/http"
	"time"

	"github.com/vaishnavghenge/vartalaap-server/internal/cfturn"
	"github.com/vaishnavghenge/vartalaap-server/internal/config"
	"github.com/vaishnavghenge/vartalaap-server/internal/httpx"
	"github.com/vaishnavghenge/vartalaap-server/internal/signaling"
)

func main() {
	cfg := config.Load()
	hub := signaling.NewHub()
	cf := cfturn.New(cfg.CFTurnKeyID, cfg.CFTurnAPIToken)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws", signaling.NewHandler(hub, cfg.AllowedOrigins))
	mux.HandleFunc("/ice-servers", httpx.NewIceHandler(cf, cfg.AllowedOrigins))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("vartalaap-server listening on :%s", cfg.Port)
	log.Fatal(srv.ListenAndServe())
}
```

- [ ] **Step 3: Build and smoke test**

```bash
go build ./...
set -a; source .env; set +a
go run ./cmd/server &
SERVER_PID=$!
sleep 1
curl -s -X POST http://localhost:8080/ice-servers -H "Origin: http://localhost:3000" | jq .
kill $SERVER_PID
```

Expected output: JSON with `iceServers` array containing `urls`, `username`, `credential`.

If you get `failed to mint credentials`, the CF endpoint / body shape doesn't match what you coded. Cross-check with `docs/cf-turn-api.md`.

- [ ] **Step 4: Commit**

```bash
git add internal/httpx cmd/server/main.go
git commit -m "feat: /ice-servers endpoint via Cloudflare TURN"
```

### Phase 2 Checkpoint

- [ ] `curl -X POST http://localhost:8080/ice-servers -H "Origin: http://localhost:3000"` returns valid ICE config
- [ ] CORS preflight (`curl -X OPTIONS ...`) returns 204 with allow headers
- [ ] Server RAM after a few requests: `ps -o rss= -p <pid>` under 25MB

**STOP. Do not start Phase 3 until user confirms.**

---

## Phase 3: Client Migration

Remove `socket.io-client`. Add a thin raw-WebSocket signaling client. Keep `simple-peer`. Orchestrate mesh peer connections with a new hook. Touch the existing `usePeerStore` minimally — add connection bookkeeping to it.

### Target File Structure (client)

```
src/
  services/
    socket/                    # DELETE
    signaling/
      protocol.ts              # NEW: wire types (mirror server)
      client.ts                # NEW: raw WS wrapper
    api/
      config.ts                # MODIFY: env-driven URLs
      ice.ts                   # NEW: fetches /ice-servers
  stores/
    peer.ts                    # MODIFY: add signal wiring helpers, keep simple-peer
  hooks/
    use-socket.ts              # DELETE
    use-signaling.ts           # NEW
    use-call.ts                # NEW: orchestrates mesh peers
  components/features/
    MeetCall.tsx               # MODIFY: use remote streams from store
    JoinMeet.tsx               # MODIFY: pre-fetch ICE servers on mount (optional)
  components/ui/
    VideoTile.tsx              # VERIFY: can render a remote MediaStream
```

### Task 3.1: Remove socket.io

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall**

```bash
cd ~/projects/vartalaap/vartalaap-client
npm uninstall socket.io socket.io-client @types/socket.io-client
```

- [ ] **Step 2: Delete old files**

```bash
rm -rf src/services/socket
rm src/hooks/use-socket.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove socket.io client + server deps"
```

### Task 3.2: Config + ICE fetcher

**Files:**
- Modify: `src/services/api/config.ts`
- Create: `src/services/api/ice.ts`

- [ ] **Step 1: Update `config.ts`**

```typescript
// src/services/api/config.ts
const serverDomain = process.env.NEXT_PUBLIC_SERVER_DOMAIN ?? 'localhost:8080'
const isSecure = process.env.NEXT_PUBLIC_SERVER_SECURE === 'true'

export const httpServerUri = `${isSecure ? 'https' : 'http'}://${serverDomain}`
export const wsServerUri = `${isSecure ? 'wss' : 'ws'}://${serverDomain}/ws`
```

- [ ] **Step 2: Write `ice.ts`**

```typescript
// src/services/api/ice.ts
import { httpServerUri } from './config'

export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

export async function fetchIceServers(): Promise<IceServer[]> {
  const res = await fetch(`${httpServerUri}/ice-servers`, { method: 'POST' })
  if (!res.ok) throw new Error(`ice-servers failed: ${res.status}`)
  const body = (await res.json()) as { iceServers: IceServer[] }
  return body.iceServers
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/api
git commit -m "feat(api): config + ICE servers fetcher"
```

### Task 3.3: Signaling wire types + WS client

**Files:**
- Create: `src/services/signaling/protocol.ts`
- Create: `src/services/signaling/client.ts`

- [ ] **Step 1: Write `protocol.ts`**

```typescript
// src/services/signaling/protocol.ts
export type MsgType =
  | 'welcome'
  | 'join'
  | 'joined'
  | 'leave'
  | 'peer-joined'
  | 'peer-left'
  | 'signal'
  | 'error'

export interface Envelope<T = unknown> {
  type: MsgType
  room?: string
  from?: string
  to?: string
  data?: T
}

export interface JoinedData { peers: string[] }
export interface PeerEventData { peerId: string }
export interface ErrorData { message: string }
```

- [ ] **Step 2: Write `client.ts`**

```typescript
// src/services/signaling/client.ts
import type { Envelope, MsgType } from './protocol'

type Handler = (env: Envelope) => void

export class SignalingClient {
  private ws: WebSocket | null = null
  private handlers = new Map<MsgType, Set<Handler>>()
  private url: string
  private peerId: string | null = null

  constructor(url: string) { this.url = url }

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
          this.handlers.get(env.type)?.forEach(h => h(env))
        } catch (err) {
          console.error('signaling: bad message', err)
        }
      }
      ws.onerror = () => reject(new Error('ws error'))
      ws.onclose = () => {
        this.ws = null
        this.peerId = null
      }
    })
  }

  disconnect() { this.ws?.close() }

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

- [ ] **Step 3: Commit**

```bash
git add src/services/signaling
git commit -m "feat(signaling): raw WS client + protocol types"
```

### Task 3.4: useSignaling hook

**Files:**
- Create: `src/hooks/use-signaling.ts`

- [ ] **Step 1: Write hook**

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
    let disposed = false
    ;(async () => {
      try {
        const id = await client.connect()
        if (disposed) { client.disconnect(); return }
        setPeerId(id)
        setConnected(true)
      } catch (e) {
        console.error('signaling connect failed', e)
      }
    })()
    return () => {
      disposed = true
      client.disconnect()
      ref.current = null
    }
  }, [])

  return { client: ref.current, peerId, connected }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-signaling.ts
git commit -m "feat(hooks): useSignaling"
```

### Task 3.5: Extend peer store with remote-stream map

**Files:**
- Modify: `src/stores/peer.ts`

The existing store keeps `peerConnections: Map<id, { peer, stream? }>`. Good — we only add (a) a remote-stream accessor for the UI, and (b) ICE-server config storage so `createPeer` can pass it through.

- [ ] **Step 1: Update `peer.ts`**

Change the `createPeer` signature to accept the ICE server list. Add `iceServers` slot to the store. Full file:

```typescript
// src/stores/peer.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'
import type { IceServer } from '@/src/services/api/ice'

interface PeerConnection {
  id: string
  peer: Peer.Instance
  stream?: MediaStream
}

interface PeerState {
  localStream: MediaStream | null
  peerConnections: Map<string, PeerConnection>
  isInitialized: boolean
  iceServers: IceServer[]

  setLocalStream: (s: MediaStream | null) => void
  setIceServers: (s: IceServer[]) => void

  addPeerConnection: (id: string, peer: Peer.Instance, stream?: MediaStream) => void
  removePeerConnection: (id: string) => void
  updatePeerStream: (id: string, stream: MediaStream) => void

  initializeCamera: () => Promise<MediaStream | null>
  stopCamera: () => void
  createPeer: (initiator: boolean, stream?: MediaStream) => Peer.Instance
  clearAll: () => void
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => ({
    localStream: null,
    peerConnections: new Map(),
    isInitialized: false,
    iceServers: [],

    setLocalStream: (stream) => set({ localStream: stream }),
    setIceServers: (s) => set({ iceServers: s }),

    addPeerConnection: (id, peer, stream) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        next.set(id, { id, peer, stream })
        return { peerConnections: next }
      }),

    removePeerConnection: (id) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) { c.peer.destroy(); next.delete(id) }
        return { peerConnections: next }
      }),

    updatePeerStream: (id, stream) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) next.set(id, { ...c, stream })
        return { peerConnections: next }
      }),

    initializeCamera: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        set({ localStream: stream, isInitialized: true })
        return stream
      } catch (e) {
        console.error('getUserMedia failed', e)
        return null
      }
    },

    stopCamera: () => {
      get().localStream?.getTracks().forEach(t => t.stop())
      set({ localStream: null, isInitialized: false })
    },

    createPeer: (initiator, stream) => {
      const { iceServers } = get()
      return new Peer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers: iceServers as RTCIceServer[] },
      })
    },

    clearAll: () => {
      const { localStream, peerConnections } = get()
      localStream?.getTracks().forEach(t => t.stop())
      peerConnections.forEach(c => c.peer.destroy())
      set({
        localStream: null,
        peerConnections: new Map(),
        isInitialized: false,
      })
    },
  }))
)
```

Note: changed `trickle: false` → `trickle: true`. With TURN, trickle ICE is meaningfully faster for call setup.

- [ ] **Step 2: Commit**

```bash
git add src/stores/peer.ts
git commit -m "feat(peer): add iceServers state, enable trickle"
```

### Task 3.6: useCall hook (mesh orchestration)

**Files:**
- Create: `src/hooks/use-call.ts`

Responsibilities:
1. On mount: fetch ICE servers, store them.
2. Wait for signaling to be connected.
3. Send `join`.
4. On `joined`: for each existing peer, create initiator Peer; wire its `signal`/`stream`/`close` events.
5. On `peer-joined`: create a non-initiator Peer for the new peer; wire the same events.
6. On `signal` (s→c): route to the right Peer instance via `.signal(data)`.
7. On `peer-left` or local unmount: destroy that Peer.

- [ ] **Step 1: Write hook**

```typescript
// src/hooks/use-call.ts
import { useEffect } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerEventData,
} from '@/src/services/signaling/protocol'
import Peer from 'simple-peer'

interface Args {
  client: SignalingClient | null
  roomId: string
  enabled: boolean
}

export function useCall({ client, roomId, enabled }: Args) {
  useEffect(() => {
    if (!client || !roomId || !enabled) return

    const store = usePeerStore
    let disposed = false

    const makePeer = (remoteId: string, initiator: boolean) => {
      const localStream = store.getState().localStream ?? undefined
      const peer = store.getState().createPeer(initiator, localStream)

      peer.on('signal', (data) => {
        client.send('signal', data, { to: remoteId })
      })
      peer.on('stream', (stream) => {
        store.getState().updatePeerStream(remoteId, stream)
      })
      peer.on('close', () => {
        store.getState().removePeerConnection(remoteId)
      })
      peer.on('error', (err) => {
        console.error('peer error', remoteId, err)
        store.getState().removePeerConnection(remoteId)
      })

      store.getState().addPeerConnection(remoteId, peer)
      return peer
    }

    const handleJoined = (env: Envelope<JoinedData>) => {
      const peers = env.data?.peers ?? []
      // We are the new joiner; initiate to everyone who's already here.
      for (const remoteId of peers) {
        makePeer(remoteId, true)
      }
    }

    const handlePeerJoined = (env: Envelope<PeerEventData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      // Someone arrived after us; wait for their offer (non-initiator).
      makePeer(remoteId, false)
    }

    const handlePeerLeft = (env: Envelope<PeerEventData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      store.getState().removePeerConnection(remoteId)
    }

    const handleSignal = (env: Envelope) => {
      if (!env.from) return
      const conn = store.getState().peerConnections.get(env.from)
      if (!conn) {
        console.warn('signal for unknown peer', env.from)
        return
      }
      try {
        conn.peer.signal(env.data as Peer.SignalData)
      } catch (e) {
        console.error('peer.signal failed', e)
      }
    }

    client.on('joined', handleJoined as any)
    client.on('peer-joined', handlePeerJoined as any)
    client.on('peer-left', handlePeerLeft as any)
    client.on('signal', handleSignal as any)

    ;(async () => {
      try {
        const iceServers = await fetchIceServers()
        if (disposed) return
        store.getState().setIceServers(iceServers)
        client.send('join', undefined, { room: roomId })
      } catch (e) {
        console.error('failed to init call', e)
      }
    })()

    return () => {
      disposed = true
      client.off('joined', handleJoined as any)
      client.off('peer-joined', handlePeerJoined as any)
      client.off('peer-left', handlePeerLeft as any)
      client.off('signal', handleSignal as any)
      store.getState().clearAll()
    }
  }, [client, roomId, enabled])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-call.ts
git commit -m "feat(hooks): useCall orchestrates mesh peer connections"
```

### Task 3.7: Wire into page + MeetCall

**Files:**
- Modify: `app/[meetCode]/page.tsx`
- Modify: `src/components/features/MeetCall.tsx`

- [ ] **Step 1: Update page to drive signaling + call**

```tsx
// app/[meetCode]/page.tsx
"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import MeetCall from "@/src/components/features/MeetCall";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { useMeetStore } from "@/src/stores/meet";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { usePeerStore } from "@/src/stores/peer";
import { useSignaling } from "@/src/hooks/use-signaling";
import { useCall } from "@/src/hooks/use-call";

export default function MeetManager() {
    const params = useParams<{ meetCode: string }>();
    const { hasJoinedMeet, setMeetCode } = useJoinMeetStore();
    const { setCurrentMeet } = useMeetStore();
    const { clearAll } = usePeerStore();

    const { client } = useSignaling();
    useCall({ client, roomId: params.meetCode, enabled: hasJoinedMeet });

    useEffect(() => {
        if (params.meetCode) {
            setMeetCode(params.meetCode);
            setCurrentMeet(params.meetCode);
        }
    }, [params.meetCode, setMeetCode, setCurrentMeet]);

    useEffect(() => {
        return () => { clearAll(); };
    }, [clearAll]);

    return (
        <div>
            {hasJoinedMeet ? <MeetCall /> : <JoinMeet />}
        </div>
    );
}
```

- [ ] **Step 2: Update MeetCall to render from `peerConnections`**

Replace the remote-tile map in `MeetCall.tsx`. Only the relevant block changes — find:

```tsx
{participants.map((participant) => (
    <VideoTile
        key={participant.id}
        participant={participant}
        stream={null}
    />
))}
```

Replace with:

```tsx
{Array.from(peerConnections.values()).map((c) => (
    <VideoTile
        key={c.id}
        participant={{ id: c.id, name: c.id.slice(0, 6) }}
        stream={c.stream ?? null}
    />
))}
```

Update the destructure near the top:
```tsx
const { localStream, initializeCamera, stopCamera, peerConnections } = usePeerStore();
```

And update the grid class condition to use `peerConnections.size + 1` instead of `participants.length + 1`.

- [ ] **Step 3: Verify `VideoTile` renders remote streams**

Read `src/components/ui/VideoTile.tsx`. If the remote branch ignores `stream` or only handles `isLocal={true}`, update so any `stream` prop (local or remote) is attached via:

```tsx
useEffect(() => {
  if (stream && videoRef.current) videoRef.current.srcObject = stream
}, [stream])
```

For remote tiles, `muted` should be false (otherwise you hear nothing). For local tiles, `muted` stays true (avoids echo of yourself).

- [ ] **Step 4: Smoke test locally**

```bash
# Terminal 1
cd ~/projects/vartalaap/vartalaap-server
set -a; source .env; set +a
go run ./cmd/server

# Terminal 2
cd ~/projects/vartalaap/vartalaap-client
NEXT_PUBLIC_SERVER_DOMAIN=localhost:8080 npm run dev
```

Open two browser windows (different Chrome profiles so mic isn't shared) at `http://localhost:3000/testroom`. Grant camera+mic in both. Enter names. Click Join.

Expected:
- Each window shows its own local tile.
- Within ~2 seconds after both join, each window shows the other's video + audio.
- Closing one window removes the tile in the other.
- `chrome://webrtc-internals` shows ICE candidates including `typ relay` (TURN).

- [ ] **Step 5: Commit**

```bash
git add app/[meetCode]/page.tsx src/components/features/MeetCall.tsx src/components/ui/VideoTile.tsx
git commit -m "feat(ui): mesh call wiring via useSignaling + useCall"
```

### Phase 3 Checkpoint

User confirms on `localhost`:
- [ ] Two browser windows on `/testroom` connect and see each other's video + audio
- [ ] Closing one window removes the tile in the other
- [ ] No console errors in either browser (WebRTC warnings about ICE state changes are fine)
- [ ] Server logs clean connect/disconnect

**STOP. Do not start Phase 4 until user confirms.**

---

## Phase 4: Deploy

### Task 4.1: systemd unit (bare VM)

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/deploy/vartalaap.service`

- [ ] **Step 1: Write unit**

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

### Task 4.2: Runbook

**Files:**
- Create: `~/projects/vartalaap/vartalaap-server/deploy/README.md`

- [ ] **Step 1: Write runbook**

````markdown
# Deploying vartalaap-server

## First-time setup on the VM

```bash
sudo useradd -r -s /bin/false vartalaap
sudo mkdir -p /opt/vartalaap
sudo chown vartalaap:vartalaap /opt/vartalaap
sudo cp deploy/vartalaap.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vartalaap
```

Create `/opt/vartalaap/.env`:
```
CF_TURN_KEY_ID=...
CF_TURN_API_TOKEN=...
PORT=8080
ALLOWED_ORIGINS=https://<your-vercel-domain>
```

## Each deploy (from dev machine)

```bash
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o vartalaap ./cmd/server
scp vartalaap vm:/tmp/
ssh vm "sudo mv /tmp/vartalaap /opt/vartalaap/vartalaap && sudo chmod +x /opt/vartalaap/vartalaap && sudo systemctl restart vartalaap"
```

## Caddy (TLS)

`/etc/caddy/Caddyfile`:
```
signal.yourdomain.com {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl reload caddy
```

## Verify

```bash
curl https://signal.yourdomain.com/healthz
# → ok
curl -X POST https://signal.yourdomain.com/ice-servers -H "Origin: https://<your-vercel-domain>" | jq .
```
````

- [ ] **Step 2: Commit**

```bash
git add deploy/README.md
git commit -m "docs: deploy runbook"
```

### Task 4.3: Client production env

**Files:**
- Create: `~/projects/vartalaap/vartalaap-client/.env.production.local.example`

- [ ] **Step 1: Document env vars**

```
NEXT_PUBLIC_SERVER_DOMAIN=signal.yourdomain.com
NEXT_PUBLIC_SERVER_SECURE=true
```

- [ ] **Step 2: Set them in Vercel**

Vercel project → Settings → Environment Variables → add both. Redeploy.

- [ ] **Step 3: End-to-end smoke test on public URLs**

Open the Vercel-deployed site in two browsers (different networks if possible — mobile hotspot on one is a good TURN test). Verify a call works. Check `chrome://webrtc-internals`; if both clients are behind different NATs, expect `typ relay` candidates (TURN in use).

### Phase 4 Checkpoint

- [ ] `https://signal.yourdomain.com/healthz` → `ok`
- [ ] Vercel-deployed client connects to production signaling server
- [ ] Two-user call works end-to-end on public URLs
- [ ] Server RSS < 50MB (`ps -o rss= -p $(pgrep vartalaap)`)

---

## Follow-up: Future SFU Migration

When you outgrow mesh (>4 participants, or clients complaining of upload pressure), the v2 plan is at `2026-04-22-cloudflare-calls-backend.md`. Rough migration cost from this plan's end state: rewrite `src/stores/peer.ts` + add server-side CF Calls proxy. Signaling server's room/join/leave code carries over mostly unchanged; only the `signal` message gets replaced with `publish`/`subscribe`/`renegotiate`.

---

## Self-Review Notes

- **Spec coverage:** Anonymous join ✅ (no auth). On-demand rooms ✅ (Hub `gcLocked`). No DB ✅. No tests ✅ (manual smoke at each phase). Keep `simple-peer`, drop `socket.io` ✅. Cloudflare TURN for NAT traversal ✅.
- **Known unknowns:**
  - Exact CF TURN credentials endpoint URL + body shape — resolved by Task 0.3's `docs/cf-turn-api.md` before Task 2.1 code lands.
  - `coder/websocket`'s `OriginPatterns` matching behavior — if it rejects localhost unexpectedly, verify the string passed matches host without port, or use `InsecureSkipVerify: true` for dev only.
- **Placeholders:** None — code blocks are complete. The one explicit deferred item (CF endpoint path in `cfturn/client.go`) has an inline instruction pointing at Task 0.3's spec as the source of truth.
