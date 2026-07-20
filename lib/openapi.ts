/**
 * OpenAPI 3 spec for interactive docs at GET /api (Swagger UI).
 * Secrets are never embedded — use Swagger's Authorize dialog with your own values.
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "PROOFR API",
    version: "1.0.0",
    description: [
      "Interactive API docs (Swagger UI) — same idea as Flask + flasgger.",
      "",
      "**How to authenticate**",
      "1. **Bearer JWT** (merchant/lender routes): get a token via Supabase password grant",
      "   (`POST {NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password` with anon key + email/password),",
      "   then click **Authorize** and paste into **BearerAuth**, *or* fill the `Authorization` header on each request.",
      "2. **Public API key** (`GET /api/public/score`): fill the **`x-api-key`** header on that request",
      "   (shown in Parameters). To create a key: Authorize as a lender → `POST /api/lenders/api-keys`",
      "   → copy the one-time `apiKey` from the response.",
      "3. **Admin** routes: fill the **`x-admin-secret`** header (same value as `ADMIN_API_SECRET`).",
      "",
      "**Do not paste real production secrets into a public write-up.** Use demo credentials out-of-band.",
    ].join("\n"),
  },
  servers: [
    {
      url: "https://proofr.onrender.com",
      description: "Deployed (Render)",
    },
    {
      url: "http://localhost:3000",
      description: "Local",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Merchants" },
    { name: "Lenders" },
    { name: "Loans" },
    { name: "Admin" },
    { name: "Public API" },
    { name: "Webhooks" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Supabase Auth access_token (merchant or lender, depending on the route).",
      },
      AdminSecret: {
        type: "apiKey",
        in: "header",
        name: "x-admin-secret",
        description: "Shared admin gate (ADMIN_API_SECRET).",
      },
      PublicApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Third-party / lender-provisioned public API key.",
      },
      MonnifySignature: {
        type: "apiKey",
        in: "header",
        name: "monnify-signature",
        description:
          "Hex HMAC-SHA512 of the raw body using MONNIFY_SECRET_KEY.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      MerchantSignup: {
        type: "object",
        required: ["phone", "email", "password", "businessName"],
        properties: {
          phone: {
            type: "string",
            example: "+2348012345678",
            description: "E.164",
          },
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
          businessName: { type: "string" },
          bvnOrNin: { type: "string" },
          personalAccountNumber: { type: "string" },
          businessStartDate: {
            type: "string",
            example: "2024-01-15",
            description: "YYYY-MM-DD",
          },
        },
      },
      LoanCreate: {
        type: "object",
        required: ["merchantId", "amount"],
        properties: {
          merchantId: { type: "string", format: "uuid" },
          amount: { type: "number", example: 90000 },
        },
      },
    },
    parameters: {
      MerchantId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      LoanId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      AdminSecretHeader: {
        name: "x-admin-secret",
        in: "header",
        required: true,
        schema: { type: "string" },
        description:
          "Value of ADMIN_API_SECRET. Paste here (or use Authorize → AdminSecret).",
      },
      PublicApiKeyHeader: {
        name: "x-api-key",
        in: "header",
        required: true,
        schema: { type: "string", example: "proofr_pk_…" },
        description:
          "Create via POST /api/lenders/api-keys after lender login. Copy the one-time `apiKey` from that response.",
      },
      MonnifySignatureHeader: {
        name: "monnify-signature",
        in: "header",
        required: true,
        schema: { type: "string" },
        description:
          "Hex HMAC-SHA512 of the exact raw JSON body using MONNIFY_SECRET_KEY.",
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    merchants_count: { type: "integer" },
                    gitCommit: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/merchants": {
      post: {
        tags: ["Merchants"],
        summary: "Merchant signup",
        description:
          "Creates Auth user + merchants row. Does not return a JWT — sign in via Supabase afterward.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MerchantSignup" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    merchantId: { type: "string", format: "uuid" },
                    approvalStatus: { type: "string", example: "pending" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/merchants/{id}/approve": {
      post: {
        tags: ["Merchants", "Admin"],
        summary: "Approve merchant (admin)",
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: "#/components/parameters/AdminSecretHeader" },
          { $ref: "#/components/parameters/MerchantId" },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              example: {},
            },
          },
        },
        responses: {
          "200": { description: "Approved (may include monnifyAccountNumber)" },
          "401": { description: "Bad admin secret" },
          "404": { description: "Merchant not found" },
        },
      },
    },
    "/api/merchants/{id}/reject": {
      post: {
        tags: ["Merchants", "Admin"],
        summary: "Reject merchant (admin)",
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: "#/components/parameters/AdminSecretHeader" },
          { $ref: "#/components/parameters/MerchantId" },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              example: {},
            },
          },
        },
        responses: {
          "200": { description: "Rejected" },
          "401": { description: "Bad admin secret" },
        },
      },
    },
    "/api/merchants/{id}/revenue": {
      get: {
        tags: ["Merchants"],
        summary: "Revenue summary",
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/MerchantId" },
          {
            name: "granularity",
            in: "query",
            schema: { type: "string", enum: ["daily", "monthly"], default: "daily" },
          },
        ],
        responses: {
          "200": {
            description: "Revenue aggregates",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    grossInflow: { type: "number" },
                    verifiedRevenue: { type: "number" },
                    trend: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          period: { type: "string" },
                          amount: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/api/merchants/{id}/report": {
      post: {
        tags: ["Merchants"],
        summary: "Generate Proof-of-Revenue report",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              example: {},
            },
          },
        },
        responses: {
          "200": {
            description: "Report created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reportId: { type: "string", format: "uuid" },
                    generatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        tags: ["Merchants"],
        summary: "Get report (latest with bearer, or by reportId without auth)",
        description:
          "With Bearer: latest report for owning merchant or any lender. With `?reportId=`: no auth (share link).",
        parameters: [
          { $ref: "#/components/parameters/MerchantId" },
          {
            name: "reportId",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "If set, no Bearer required",
          },
        ],
        security: [{ BearerAuth: [] }, {}],
        responses: {
          "200": { description: "Full report payload" },
          "401": { description: "Unauthorized (bearer path)" },
          "404": { description: "No report" },
        },
      },
    },
    "/api/merchants/{id}/loans": {
      get: {
        tags: ["Merchants"],
        summary: "List merchant's loans",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        responses: {
          "200": { description: "Loan list" },
          "401": { description: "Unauthorized" },
          "403": { description: "Not the owning merchant" },
        },
      },
    },
    "/api/merchants/{id}/public-api-consent": {
      get: {
        tags: ["Merchants"],
        summary: "Get public API consent",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        responses: {
          "200": {
            description: "Consent state",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    consentGranted: { type: "boolean" },
                    consentedAt: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Merchants"],
        summary: "Set public API consent",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["consent"],
                properties: {
                  consent: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated consent" },
        },
      },
    },
    "/api/lenders/search": {
      get: {
        tags: ["Lenders"],
        summary: "Search merchants",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "query",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Business name (partial) or merchant UUID",
          },
        ],
        responses: {
          "200": { description: "Matching merchants" },
          "401": { description: "Unauthorized" },
          "403": { description: "Not a lender" },
        },
      },
    },
    "/api/lenders/merchants/{id}": {
      get: {
        tags: ["Lenders"],
        summary: "Merchant report (lender view)",
        description: "Same shape as GET /api/merchants/{id}/report (latest).",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        responses: {
          "200": { description: "Report" },
          "404": { description: "No report yet" },
        },
      },
    },
    "/api/lenders/api-keys": {
      get: {
        tags: ["Lenders"],
        summary: "List API keys",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Keys (no raw secrets)" },
        },
      },
      post: {
        tags: ["Lenders"],
        summary: "Generate API key",
        description: "Raw `apiKey` returned once only.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Includes one-shot apiKey" },
        },
      },
    },
    "/api/lenders/api-keys/{id}/revoke": {
      post: {
        tags: ["Lenders"],
        summary: "Revoke API key",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Revoked" },
          "404": { description: "Not found / not owned" },
        },
      },
    },
    "/api/loans": {
      post: {
        tags: ["Loans"],
        summary: "Create loan",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoanCreate" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    loanId: { type: "string", format: "uuid" },
                    status: { type: "string", example: "pending" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/loans/{id}/approve": {
      post: {
        tags: ["Loans"],
        summary: "Approve loan",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/LoanId" }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              example: {},
            },
          },
        },
        responses: {
          "200": { description: "Approved with repayment schedule + terms" },
          "403": { description: "Not this loan's lender" },
        },
      },
    },
    "/api/loans/{id}": {
      get: {
        tags: ["Loans"],
        summary: "Get loan (repayment progress)",
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/LoanId" }],
        responses: {
          "200": { description: "Current loan state" },
        },
      },
    },
    "/api/admin/fraud-queue": {
      get: {
        tags: ["Admin"],
        summary: "Open fraud flags queue",
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: "#/components/parameters/AdminSecretHeader" }],
        responses: {
          "200": { description: "Queue" },
          "401": { description: "Bad admin secret" },
        },
      },
    },
    "/api/admin/fraud-flags/{id}/override": {
      post: {
        tags: ["Admin"],
        summary: "Override fraud flag",
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: "#/components/parameters/AdminSecretHeader" },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string", enum: ["clear", "confirm"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated" },
        },
      },
    },
    "/api/admin/loan-outcomes": {
      get: {
        tags: ["Admin"],
        summary: "Loan outcome tracking",
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: "#/components/parameters/AdminSecretHeader" }],
        responses: {
          "200": { description: "Outcomes list" },
        },
      },
    },
    "/api/admin/pending-merchants": {
      get: {
        tags: ["Admin"],
        summary: "Pending merchant approvals",
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: "#/components/parameters/AdminSecretHeader" }],
        responses: {
          "200": { description: "Pending merchants" },
        },
      },
    },
    "/api/public/score": {
      get: {
        tags: ["Public API"],
        summary: "Public credit score lookup by phone",
        description: [
          "Requires header `x-api-key` (shown below in Parameters).",
          "",
          "**How to get a key**",
          "1. Get a lender bearer token (Supabase login with the demo lender account).",
          "2. Click Authorize → BearerAuth (paste the JWT).",
          "3. Call `POST /api/lenders/api-keys` — response includes `apiKey` **once**.",
          "4. Paste that value into `x-api-key` here and Execute.",
        ].join("\n"),
        parameters: [
          { $ref: "#/components/parameters/PublicApiKeyHeader" },
          {
            name: "phone",
            in: "query",
            required: true,
            schema: { type: "string", example: "+2348012345678" },
            description: "E.164; merchant must be approved + consented",
          },
        ],
        responses: {
          "200": { description: "Capped score fields" },
          "401": { description: "Missing/invalid/revoked API key" },
          "404": { description: "Not found / no consent" },
        },
      },
    },
    "/api/webhooks/monnify": {
      post: {
        tags: ["Webhooks"],
        summary: "Monnify transaction webhook",
        security: [{ MonnifySignature: [] }],
        description:
          "Signature must be recomputed whenever the body changes (HMAC-SHA512 of exact raw JSON).",
        parameters: [{ $ref: "#/components/parameters/MonnifySignatureHeader" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
              example: {
                eventType: "SUCCESSFUL_TRANSACTION",
                eventData: {
                  product: {
                    type: "RESERVED_ACCOUNT",
                    reference: "PROOFR-<merchantId>",
                  },
                  transactionReference: "MNFY|example|000001",
                  amountPaid: 30000,
                  paymentStatus: "PAID",
                  destinationAccountInformation: {
                    accountNumber: "4000000000",
                    bankCode: "035",
                    bankName: "Wema bank",
                  },
                  paymentSourceInformation: [
                    {
                      accountName: "Customer",
                      accountNumber: "0123456789",
                      bankCode: "057",
                      amountPaid: 30000,
                    },
                  ],
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Acked" },
          "401": { description: "Bad signature" },
        },
      },
    },
  },
} as const;
