// Vite's ?raw suffix imports a file's text.
declare module "*?raw" {
  const content: string;
  export default content;
}
