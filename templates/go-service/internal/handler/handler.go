package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/julienschmidt/httprouter"

	"{{.Module}}/internal/service"
)

// Handler provides HTTP handlers for the API
type Handler struct {
	svc *service.Service
}

// New creates a new Handler
func New(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

// Health returns service health status
func (h *Handler) Health(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ListItems returns all items
func (h *Handler) ListItems(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ctx := r.Context()

	items, err := h.svc.ListItems(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "failed to list items", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, items)
}

// GetItem returns a single item by ID
func (h *Handler) GetItem(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ctx := r.Context()

	id, err := strconv.ParseInt(ps.ByName("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	item, err := h.svc.GetItem(ctx, id)
	if err != nil {
		if err == service.ErrNotFound {
			writeError(w, http.StatusNotFound, "item not found")
			return
		}
		slog.ErrorContext(ctx, "failed to get item", "id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, item)
}

// CreateItem creates a new item
func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ctx := r.Context()

	var input service.CreateItemInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	item, err := h.svc.CreateItem(ctx, input)
	if err != nil {
		if err == service.ErrValidation {
			writeError(w, http.StatusBadRequest, "validation failed")
			return
		}
		slog.ErrorContext(ctx, "failed to create item", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

// UpdateItem updates an existing item
func (h *Handler) UpdateItem(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ctx := r.Context()

	id, err := strconv.ParseInt(ps.ByName("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var input service.UpdateItemInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	item, err := h.svc.UpdateItem(ctx, id, input)
	if err != nil {
		if err == service.ErrNotFound {
			writeError(w, http.StatusNotFound, "item not found")
			return
		}
		slog.ErrorContext(ctx, "failed to update item", "id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, item)
}

// DeleteItem removes an item
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ctx := r.Context()

	id, err := strconv.ParseInt(ps.ByName("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.DeleteItem(ctx, id); err != nil {
		if err == service.ErrNotFound {
			writeError(w, http.StatusNotFound, "item not found")
			return
		}
		slog.ErrorContext(ctx, "failed to delete item", "id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
