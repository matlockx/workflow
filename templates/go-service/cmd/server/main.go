package main

import (
	"log/slog"
	"net/http"

	"github.com/flachnetz/startup/v2"
	"github.com/flachnetz/startup/v2/startup_base"
	"github.com/flachnetz/startup/v2/startup_http"
	"github.com/flachnetz/startup/v2/startup_postgres"
	"github.com/jmoiron/sqlx"
	"github.com/julienschmidt/httprouter"

	"{{.Module}}/internal/handler"
	"{{.Module}}/internal/repository"
	"{{.Module}}/internal/service"
)

// Options defines all configuration for the service.
// Each embedded struct adds its own CLI flags.
type Options struct {
	Base     startup_base.BaseOptions
	Postgres startup_postgres.PostgresOptions
	HTTP     startup_http.HTTPOptions

	// App-specific options
	App AppOptions
}

// AppOptions contains application-specific configuration.
type AppOptions struct {
	// Add your custom flags here
	// Example: WorkerCount int `long:"workers" default:"4" description:"Number of background workers"`
}

func main() {
	var opts Options

	// Configure database migrations to run on startup
	opts.Postgres.Inputs.Initializer = startup_postgres.DefaultMigration("schema_migrations")

	// Parse CLI flags and auto-initialize all modules
	startup.MustParseCommandLine(&opts)

	// Get initialized database connection
	db := opts.Postgres.Connection()
	defer startup_base.Close(db, "database connection")

	// Wire up dependencies
	app := wireApp(db)

	slog.Info("Starting {{.ServiceName}} service")

	// Start HTTP server (blocks until shutdown signal)
	opts.HTTP.Serve(startup_http.Config{
		Name:    "{{.ServiceName}}",
		Routing: app.Routes,
	})
}

// App holds all application dependencies
type App struct {
	Handler *handler.Handler
}

// wireApp creates and wires all application components
func wireApp(db *sqlx.DB) *App {
	repo := repository.New(db)
	svc := service.New(repo)
	h := handler.New(svc)

	return &App{Handler: h}
}

// Routes configures HTTP routing
func (a *App) Routes(router *httprouter.Router) http.Handler {
	// Health check (in addition to /admin/ping)
	router.GET("/health", a.Handler.Health)

	// API routes
	router.GET("/api/v1/items", a.Handler.ListItems)
	router.GET("/api/v1/items/:id", a.Handler.GetItem)
	router.POST("/api/v1/items", a.Handler.CreateItem)
	router.PUT("/api/v1/items/:id", a.Handler.UpdateItem)
	router.DELETE("/api/v1/items/:id", a.Handler.DeleteItem)

	return router
}
