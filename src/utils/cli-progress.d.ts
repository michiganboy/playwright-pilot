declare module "cli-progress" {
  export interface SingleBarOptions {
    format?: string;
    barCompleteChar?: string;
    barIncompleteChar?: string;
    hideCursor?: boolean;
    clearOnComplete?: boolean;
    [key: string]: any;
  }

  export interface MultiBarOptions {
    format?: string;
    barCompleteChar?: string;
    barIncompleteChar?: string;
    hideCursor?: boolean;
    clearOnComplete?: boolean;
    [key: string]: any;
  }

  export class SingleBar {
    constructor(options: SingleBarOptions, preset?: any);
    start(total: number, startValue: number, payload?: any): void;
    update(current: number, payload?: any): void;
    stop(): void;
    log(message: string): void;
  }

  export class MultiBar {
    constructor(options: MultiBarOptions, preset?: any);
    create(total: number, startValue: number, payload?: any): SingleBar;
    stop(): void;
    log(message: string): void;
  }

  export namespace Presets {
    export const shades_classic: any;
  }

  export { SingleBar, MultiBar, Presets };

  const cliProgress: {
    SingleBar: typeof SingleBar;
    MultiBar: typeof MultiBar;
    Presets: typeof Presets;
  };

  export default cliProgress;
}
