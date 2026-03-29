package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
)

// Item represents an item in the database
type Item struct {
	ID          int64     `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Description string    `db:"description" json:"description"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at" json:"updated_at"`
}

// Repository provides database access
type Repository struct {
	db *sqlx.DB
}

// New creates a new Repository
func New(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// List returns all items
func (r *Repository) List(ctx context.Context) ([]Item, error) {
	var items []Item
	err := r.db.SelectContext(ctx, &items,
		`SELECT id, name, description, created_at, updated_at 
		 FROM items 
		 ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	return items, nil
}

// GetByID returns a single item by ID
func (r *Repository) GetByID(ctx context.Context, id int64) (*Item, error) {
	var item Item
	err := r.db.GetContext(ctx, &item,
		`SELECT id, name, description, created_at, updated_at 
		 FROM items 
		 WHERE id = $1`, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// Create inserts a new item and returns it
func (r *Repository) Create(ctx context.Context, name, description string) (*Item, error) {
	var item Item
	err := r.db.GetContext(ctx, &item,
		`INSERT INTO items (name, description) 
		 VALUES ($1, $2) 
		 RETURNING id, name, description, created_at, updated_at`,
		name, description)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// Update modifies an existing item
func (r *Repository) Update(ctx context.Context, id int64, name, description string) (*Item, error) {
	var item Item
	err := r.db.GetContext(ctx, &item,
		`UPDATE items 
		 SET name = $1, description = $2, updated_at = NOW() 
		 WHERE id = $3 
		 RETURNING id, name, description, created_at, updated_at`,
		name, description, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// Delete removes an item by ID
func (r *Repository) Delete(ctx context.Context, id int64) (bool, error) {
	result, err := r.db.ExecContext(ctx,
		`DELETE FROM items WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}
