import process from "process/browser";
import { WriteStream, ReadStream } from "./tty";

Object.assign(process, {
  stdin: new ReadStream(),
  stdout: new WriteStream(1),
  stderr: new WriteStream(2),
  execArgv: [],
});

module.exports = process;
export default process;
