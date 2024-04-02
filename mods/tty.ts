import { EventEmitter } from "stream";
import { Writable, Readable } from "stream";

class TTY extends EventEmitter {
  readonly _stdinBuffer: ([Buffer, any])[] = [];
  constructor() {
    super();
    this._stdinBuffer = [];
    this.on("input", (chunk, encoding) => {
      this._stdinBuffer.push([chunk, encoding]);
    });
  }
}

const _tty = new TTY();

const _centralReadStream = new Readable({
  read(_size) {
    for (const [chunk, encoding] of _tty._stdinBuffer) {
      this.push(chunk, encoding);
    }
  },
});

const _centralWriteStream = new Writable({
  write(chunk, encoding, callback) {
    _tty.emit("output", chunk, encoding);
    callback();
  },
});

export class ReadStream extends Readable {
  constructor() {
    super({
      read() {
        for (const [chunk, encoding] of _tty._stdinBuffer) {
          this.push(chunk, encoding);
        }
      },
    });
  }

  setRawMode(_mode: boolean) {
    return;
  }
}

export class WriteStream extends Writable {
  public readonly columns = 120;
  public readonly rows = 80;
  constructor(readonly fd: number) {
    super({
      write(chunk, encoding, callback) {
        return _centralWriteStream.write(chunk, encoding, callback);
      },
    });
  }
}

export const isTTY = true;
export const isRAW = false;
export const isatty = (fd: number) => fd < 3;
