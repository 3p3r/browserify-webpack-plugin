// @ts-ignore - no types
import process from "process/browser";

let cwd = "/";

Object.assign(process, {
  stdin: {},
  stdout: {
    write: (data: string) => console.log(data),
  },
  stderr: {
    write: (data: string) => console.error(data),
  },
  execArgv: [],
  cwd: () => cwd,
  chdir: (dir: string) => {
    cwd = dir;
  },
});

export default process;
