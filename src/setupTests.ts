import '@testing-library/jest-dom/vitest';

// jsdom has no WebGL or 2D canvas; report "unavailable" quietly.
if (typeof HTMLCanvasElement !== 'undefined') HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
