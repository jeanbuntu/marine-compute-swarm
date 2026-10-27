import '@testing-library/jest-dom/vitest';

// jsdom has no WebGL or 2D canvas; report "unavailable" quietly.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
