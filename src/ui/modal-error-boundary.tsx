import { Component, type ReactNode } from "react";

interface ModalErrorBoundaryProps {
  readonly fallback: (error: unknown) => ReactNode;
  readonly children: ReactNode;
}

/**
 * Keeps a failure inside the modal from taking down the window it is shown in. A modal stays open
 * while the extension is reloaded under it, as when it is rebuilt during development, and then
 * renders with injectables no longer registered.
 */
export class ModalErrorBoundary extends Component<
  ModalErrorBoundaryProps,
  { error?: unknown; failed: boolean }
> {
  state: { error?: unknown; failed: boolean } = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  render() {
    return this.state.failed
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}
