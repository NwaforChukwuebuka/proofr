/**
 * Monnify sandbox client — reserved (virtual) account issuance.
 * Sandbox only, per project constraints: https://sandbox.monnify.com
 * Docs: https://developers.monnify.com/docs (Reserve An Account V1,
 * /api/v1/auth/login for token auth).
 */

const MONNIFY_BASE_URL = "https://sandbox.monnify.com";

interface MonnifyLoginResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: {
    accessToken: string;
    expiresIn: number;
  };
}

export interface MonnifyReservedAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
}

interface MonnifyCreateReservedAccountResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: {
    contractCode: string;
    accountReference: string;
    accountName: string;
    currencyCode: string;
    customerEmail: string;
    customerName: string;
    collectionChannel: string;
    reservationReference: string;
    reservedAccountType: string;
    status: string;
    createdOn: string;
    // Without `getAllAvailableBanks: true`, Monnify's sandbox returns a
    // single flat account (accountNumber/bankName/bankCode) rather than
    // the `accounts[]` array shown in some of Monnify's docs — confirmed
    // against a live sandbox call.
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
    accounts?: MonnifyReservedAccount[];
  };
}

export interface ReservedAccountResult {
  accountNumber: string;
  bankName: string;
  bankCode: string;
  accountReference: string;
  reservationReference: string;
}

// Cached in module scope — fine for this project's single Render web
// service process; each token is valid ~60 minutes per Monnify's docs.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const apiKey = process.env.MONNIFY_API_KEY;
  const secretKey = process.env.MONNIFY_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error("MONNIFY_API_KEY / MONNIFY_SECRET_KEY are not configured");
  }

  const basicAuth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  const data = (await res.json()) as MonnifyLoginResponse;
  if (!res.ok || !data.requestSuccessful) {
    throw new Error(`Monnify login failed: ${data.responseMessage ?? res.statusText}`);
  }

  // Refresh a little early to avoid using a token that expires mid-request.
  cachedToken = {
    accessToken: data.responseBody.accessToken,
    expiresAt: Date.now() + (data.responseBody.expiresIn - 60) * 1000,
  };
  return cachedToken.accessToken;
}

export interface CreateReservedAccountInput {
  accountReference: string;
  accountName: string;
  customerEmail: string;
  customerName: string;
}

export async function createReservedAccount(
  input: CreateReservedAccountInput
): Promise<ReservedAccountResult> {
  const contractCode = process.env.MONNIFY_CONTRACT_CODE;
  if (!contractCode) {
    throw new Error("MONNIFY_CONTRACT_CODE is not configured");
  }

  const accessToken = await getAccessToken();

  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/bank-transfer/reserved-accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountReference: input.accountReference,
      accountName: input.accountName,
      currencyCode: "NGN",
      contractCode,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      // customerBvn intentionally omitted: PROOFR does not persist raw
      // BVN/NIN digits (milestone 2's KYC step only stores a verified
      // boolean + hashed reference), and Monnify's V1 endpoint treats
      // customerBvn as optional at account-creation time.
    }),
  });

  const data = (await res.json()) as MonnifyCreateReservedAccountResponse;
  if (!res.ok || !data.requestSuccessful) {
    throw new Error(
      `Monnify reserved account creation failed: ${data.responseMessage ?? res.statusText}`
    );
  }

  const account = data.responseBody.accounts?.[0] ?? {
    accountNumber: data.responseBody.accountNumber,
    bankName: data.responseBody.bankName,
    bankCode: data.responseBody.bankCode,
  };
  if (!account.accountNumber) {
    throw new Error("Monnify reserved account creation returned no account number");
  }

  return {
    accountNumber: account.accountNumber,
    bankName: account.bankName ?? "",
    bankCode: account.bankCode ?? "",
    accountReference: data.responseBody.accountReference,
    reservationReference: data.responseBody.reservationReference,
  };
}
