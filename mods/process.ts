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
  env: {
    DEBUG: "*",
  },
});

export default process;
