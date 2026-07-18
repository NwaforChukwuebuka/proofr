# PROOFR MVP Product Requirements Document (PRD)

## Version

-   Version: 1.0 (Investor MVP)
-   Status: Draft

## Vision

PROOFR is a Proof-of-Revenue platform that enables informal businesses
to build a trusted financial identity from verified business payments,
unlocking access to credit.

## Problem

Millions of MSMEs operate through personal bank accounts. Lenders cannot
distinguish genuine business revenue from personal transfers, making
underwriting difficult and expensive.

## MVP Goal

Demonstrate that: 1. Merchants will collect payments through dedicated
virtual accounts. 2. Revenue can be verified and cleaned. 3. A lender
can view a trusted Proof-of-Revenue profile. 4. Loan repayment can be
automated from future revenue.

## Success Metrics

-   100 onboarded merchants
-   80% active after 30 days
-   ₦50M verified payment volume
-   First lender integration
-   \<2% suspected fraud rate

## Personas

### Merchant

Needs funding and simple payment collection.

### Lender

Needs trusted revenue data.

### Admin

Reviews fraud and manages merchants.

## In Scope

-   Merchant registration
-   KYC/KYB
-   Virtual account issuance
-   Payment webhook ingestion
-   Revenue dashboard
-   Basic fraud detection
-   Proof-of-Revenue report
-   Lender portal
-   Admin portal

## Out of Scope

-   Multiple countries
-   Cash digitization
-   Accounting suite
-   Insurance
-   Supplier financing

## User Stories

### Merchant

-   Register business
-   Complete verification
-   Receive virtual account
-   Share account with customers
-   View verified revenue
-   Share report with lender

### Lender

-   Search merchant
-   View score and revenue
-   Download report

## Functional Requirements

### Merchant Onboarding

-   Phone/email signup
-   BVN/NIN verification
-   Business details
-   Approval workflow

### Payments

-   Issue reserved virtual account
-   Receive webhooks
-   Store immutable transaction records

### Revenue Engine

Compute: - Gross inflow - Verified revenue - Daily/monthly trends

### Fraud Rules

Flag: - Circular transfers - Self-funding - Excessive identical
transfers - Velocity spikes

### Proof-of-Revenue Report

Contains: - Merchant profile - Verification status - Revenue summary -
Trend charts - Revenue confidence score - Fraud flags

### Admin

-   Merchant review
-   Fraud queue
-   Manual overrides
-   Audit log

## Non-functional Requirements

-   API-first
-   Mobile-first
-   \<2 second dashboard loads
-   Encryption in transit and at rest
-   Audit logging

## High-Level Architecture

Customer → Virtual Account → Payment Provider → Webhooks → Revenue
Engine → Fraud Engine → Merchant Dashboard → Lender Portal

## Risks

-   Merchant revenue manipulation
-   Low adoption
-   Payment provider downtime

## Roadmap

Phase 1: MVP Phase 2: Credit scoring Phase 3: Automated lending
marketplace Phase 4: Financial identity network

## Investor Demo Flow

1.  Merchant signs up.
2.  Virtual account issued.
3.  Demo customer pays.
4.  Revenue dashboard updates.
5.  Fraud engine scores payment.
6.  Proof-of-Revenue report generated.
7.  Lender approves mock loan.
8.  Repayment automation illustrated.

## Acceptance Criteria

-   Merchant onboarded in under 10 minutes.
-   Payments reflected within 30 seconds.
-   Report generated in under 5 seconds.
-   Fraud rules execute automatically.
-   Lender can access report securely.
