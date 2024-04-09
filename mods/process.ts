// @ts-ignore - no types
import process from "process/browser";

Object.assign(process, {
  stdin: {},
  stdout: {
    write: (data: string) => console.log(data),
  },
  stderr: {
    write: (data: string) => console.error(data),
  },
  execArgv: [],
});

export default process;
