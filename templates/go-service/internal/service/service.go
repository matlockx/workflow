package service

import (
	"context"
	"errors"

	"{{.Module}}/internal/repository"
)

// Common errors
var (
	ErrNotFound   = errors.New("not found")
	ErrValidation = errors.New("validation failed")
)

// Item is the domain model
type Item = repository.Item

// CreateItemInput is the input for creating an item
type CreateItemInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// UpdateItemInput is the input for updating an item
type UpdateItemInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Service provides business logic
type Service struct {
	repo *repository.Repository
}

// New creates a new Service
func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

// ListItems returns all items
func (s *Service) ListItems(ctx context.Context) ([]Item, error) {
	items, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	// Return empty slice instead of nil
	if items == nil {
		items = []Item{}
	}
	return items, nil
}

// GetItem returns a single item by ID
func (s *Service) GetItem(ctx context.Context, id int64) (*Item, error) {
	item, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, ErrNotFound
	}
	return item, nil
}

// CreateItem creates a new item
func (s *Service) CreateItem(ctx context.Context, input CreateItemInput) (*Item, error) {
	// Validate input
	if input.Name == "" {
		return nil, ErrValidation
	}

	return s.repo.Create(ctx, input.Name, input.Description)
}

// UpdateItem updates an existing item
func (s *Service) UpdateItem(ctx context.Context, id int64, input UpdateItemInput) (*Item, error) {
	// Validate input
	if input.Name == "" {
		return nil, ErrValidation
	}

	item, err := s.repo.Update(ctx, id, input.Name, input.Description)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, ErrNotFound
	}
	return item, nil
}

// DeleteItem removes an item
func (s *Service) DeleteItem(ctx context.Context, id int64) error {
	deleted, err := s.repo.Delete(ctx, id)
	if err != nil {
		return err
	}
	if !deleted {
		return ErrNotFound
	}
	return nil
}
