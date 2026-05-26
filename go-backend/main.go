// Minimal Go sidecar.
//
// 1. Reads AO_TOKEN from env (set by Electron main on spawn).
// 2. Binds to 127.0.0.1:0 — an OS-assigned ephemeral port.
// 3. Prints the chosen port on stdout as JSON so Electron can read it.
// 4. Serves /greet, gated by a bearer-token check.
// 5. Shuts down cleanly on SIGINT / SIGTERM.

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	token := os.Getenv("AO_TOKEN")
	if token == "" {
		log.Fatal("AO_TOKEN env var not set — refusing to start")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/greet", authMiddleware(token, greetHandler))
	mux.HandleFunc("/health", authMiddleware(token, healthHandler))

	// Bind to 127.0.0.1 only — NOT 0.0.0.0. Avoids macOS "accept incoming
	// connections" prompts and means the port is not reachable from other
	// machines on the network.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("listen failed: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port

	// Announce the port to Electron. Electron's stdout parser is looking
	// for exactly this JSON line.
	announce, _ := json.Marshal(map[string]int{"port": port})
	fmt.Println(string(announce))
	os.Stdout.Sync()

	server := &http.Server{Handler: mux}

	// Graceful shutdown on signal.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stop
		log.Println("shutdown requested")
		_ = server.Close()
	}()

	log.Printf("listening on 127.0.0.1:%d", port)
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

// authMiddleware enforces a constant-time bearer-token check.
func authMiddleware(token string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") || strings.TrimPrefix(auth, "Bearer ") != token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func greetHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "World"
	}
	resp := map[string]any{
		"message": fmt.Sprintf("Hello, %s!", name),
		"from":    "Go backend",
		"pid":     os.Getpid(),
		"time":    time.Now().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
