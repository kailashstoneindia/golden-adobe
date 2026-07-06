/// <reference types="vite/client" />

type CssModuleClasses = Readonly<Record<string, string>>;

declare module '*.module.css' {
  const classes: CssModuleClasses;
  export default classes;
}
