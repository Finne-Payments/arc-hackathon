import swaggerJSDoc from "swagger-jsdoc";

/* ============================================================================
   OpenAPI spec, assembled by swagger-jsdoc from the @openapi JSDoc blocks in
   src/routes/*.ts. Served as interactive docs at /api-docs and as raw JSON at
   /api-docs.json (the mounting lives in app.ts → setupSwagger).

   The glob is relative to process.cwd(); both `npm run dev` and `npm run start`
   run from the backend/ root via tsx, so "src/routes/*.ts" resolves correctly.
   ========================================================================== */

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Finné API",
      version: "0.1.0",
      description:
        "Express REST API over MongoDB. Dispute system for stablecoin payouts on Circle's Refund Protocol, running on Arc testnet.",
    },
    servers: [{ url: "/", description: "Backend root (routes mounted at /)" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http" as const,
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Finné JWT from /auth/wallet. Send as: Authorization: Bearer <token>",
        },
      },
    },
  },
  apis: ["src/routes/*.ts"],
};

export const swaggerSpec = swaggerJSDoc(options);
