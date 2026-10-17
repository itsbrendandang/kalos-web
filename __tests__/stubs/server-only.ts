// vitest stand-in for the `server-only` package. The real package throws when
// imported outside the react-server condition, which vitest's node
// environment does not set; Next's own build still enforces it.
export {};
