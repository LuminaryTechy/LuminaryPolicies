# Luminary Hospice — Policy Hub
### Deployment Guide

---

## Overview

The Policy Hub is a BAA-eligible Azure application that lets Luminary Hospice employees search, browse, and ask AI-powered questions about organizational policies.

**Stack:**
- **Azure Static Web Apps** — React TypeScript frontend
- **Azure Functions (Node 20)** — REST API + blob trigger indexer
- **Azure AI Search (Basic)** — Full-text + semantic + vector search
- **Azure OpenAI (GPT-4o)** — Natural language Q&A with citations
- **Azure Blob Storage** — Policy document store
- **Azure Key Vault** — Secrets management
- **Azure Entra ID (AD)** — Authentication and role-based access

**Estimated monthly cost:** ~$100–130/month (Search Basic ~$75, OpenAI pay-per-use ~$20–40, Storage/Functions/SWA pennies)

---

## Prerequisites

Before deploying, you need:

1. **Azure subscription** with Contributor access
2. **Azure CLI** installed: https://docs.microsoft.com/cli/azure/install-azure-cli
3. **Node.js 20+** installed
4. **GitHub account** (for CI/CD)
5. **Microsoft 365 tenant** with Entra ID (you already have this)

---

## Step 1 — Create Azure AD App Registration

In the Azure Portal → Microsoft Entra ID → App registrations → New registration:

1. Name: `Luminary Policy Hub`
2. Supported account types: `Accounts in this organizational directory only`
3. Redirect URI: `Single-page application (SPA)` → `http://localhost:3000` (add prod URL later)
4. Click **Register**
5. Note the **Application (client) ID** and **Directory (tenant) ID**

Then:
- **API permissions** → Add `openid`, `profile`, `email`, `User.Read` (Microsoft Graph)
- **Expose an API** → Set Application ID URI to `api://{client-id}`
- **Add a scope**: name `Policies.Read`, admin consent required: No
- **Manifest** → Set `"groupMembershipClaims": "SecurityGroup"`

---

## Step 2 — Create Entra ID Security Groups

In Azure Portal → Microsoft Entra ID → Groups → New group:

Create four Security groups (note the Object ID of each):
- `LH-PolicyHub-ITAdmin`
- `LH-PolicyHub-HR`
- `LH-PolicyHub-Compliance`
- `LH-PolicyHub-ClinicalLeads`

Add the appropriate employees to each group.

---

## Step 3 — Deploy Azure Infrastructure

```bash
# Login
az login
az account set --subscription YOUR_SUBSCRIPTION_ID

# Create resource group
az group create --name rg-luminary-policyhub --location eastus

# Fill in main.parameters.json with your values, then deploy
az deployment group create \
  --resource-group rg-luminary-policyhub \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json

# After main.bicep completes, create the search index
az deployment group create \
  --resource-group rg-luminary-policyhub \
  --template-file infra/search-index.bicep \
  --parameters searchServiceName=srch-policyhub-prod-lh
```

**Save the outputs** — you'll need the URLs and names for the next steps.

---

## Step 4 — Configure the App Registration Redirect URI

Once the Static Web App is deployed:

1. Azure Portal → App registrations → Luminary Policy Hub
2. Authentication → Add redirect URI → `https://{your-static-web-app}.azurestaticapps.net`
3. Also add: `https://{your-custom-domain}` if you have one

---

## Step 5 — Configure GitHub Repository

1. Push this code to a GitHub repository
2. In GitHub → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|--------|-------|
| `AZURE_CREDENTIALS` | Output of: `az ad sp create-for-rbac --name "gh-policyhub-deploy" --role contributor --scopes /subscriptions/{sub-id}/resourceGroups/rg-luminary-policyhub --sdk-auth` |
| `AZURE_FUNCTION_APP_NAME` | `func-policyhub-prod-lh` |
| `AZURE_STATIC_WEB_APP_TOKEN` | From: Azure Portal → Static Web App → Manage deployment token |
| `VITE_APP_CLIENT_ID` | App registration client ID |
| `VITE_TENANT_ID` | Your tenant ID |
| `VITE_API_BASE_URL` | `https://func-policyhub-prod-lh.azurewebsites.net/api` |
| `VITE_IT_ADMIN_GROUP_ID` | Object ID of LH-PolicyHub-ITAdmin group |
| `VITE_HR_GROUP_ID` | Object ID of LH-PolicyHub-HR group |
| `VITE_COMPLIANCE_GROUP_ID` | Object ID of LH-PolicyHub-Compliance group |
| `VITE_CLINICAL_LEADS_GROUP_ID` | Object ID of LH-PolicyHub-ClinicalLeads group |

3. Push to `main` — the GitHub Actions workflow will deploy automatically.

---

## Step 6 — Upload Policy Documents

Policy documents go into Azure Blob Storage. Two ways to do it:

### Option A — Upload through the app (recommended)
1. Sign in as an HR, Compliance, or IT Admin user
2. Navigate to the **Upload** tab
3. Fill in the metadata form and upload the .docx file
4. The file is indexed automatically

### Option B — Bulk upload via Azure CLI
Name your files: `3-2-01_Patient_Rights_and_Responsibilities.docx`
(Policy number with dashes, then underscore, then title with underscores)

```bash
# Upload all published policies at once
az storage blob upload-batch \
  --account-name stpolicyhubbprodlh \
  --destination policies-published \
  --source ./policy-documents/ \
  --pattern "*.docx"
```
The blob trigger indexer will process each file automatically (allow ~30 seconds per file).

---

## Permission Model

| Role | Who | Can Do |
|------|-----|--------|
| **Staff** | All employees | Search, browse, ask — published policies only |
| **Clinical Lead** | Clinical managers | Same + see draft/in-review policies in clinical categories |
| **HR** | HR team members | Same + see HR drafts + upload/manage HR policies |
| **Compliance** | Compliance Director | See all drafts + upload/manage all policies |
| **IT Admin** | IT team | Full access to everything |

---

## Local Development

```bash
# API
cd api
npm install
cp .env.example .env.local   # Fill in values
npm run build
npm start                     # Runs on http://localhost:7071

# Frontend (in a separate terminal)
cd frontend
npm install
cp .env.example .env.local    # Fill in values
npm run dev                   # Runs on http://localhost:3000
```

---

## BAA Compliance Notes

All Azure services used are covered under Microsoft's Healthcare BAA:
- Azure Storage, Azure Functions, Azure AI Search, Azure OpenAI, Azure Key Vault, Azure Static Web Apps, Azure Monitor/App Insights — all BAA-eligible.
- No Copilot Studio, no Microsoft 365 Copilot (which would require separate BAA evaluation).
- All data stays within your Azure tenant boundary.
- PHI should not be stored in policy text — policies are administrative documents, not patient records.

---

## Support

For deployment issues, contact the IT Admin or refer to Azure documentation at https://docs.microsoft.com.
