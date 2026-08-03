/* Ambient declaration — swagger-jsdoc v6 ships no bundled TypeScript types. */
declare module "swagger-jsdoc" {
  const swaggerJSDoc: (options: unknown) => Record<string, unknown>;
  export default swaggerJSDoc;
}
