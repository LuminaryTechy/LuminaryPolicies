// ============================================================
// Luminary Hospice — Policy Hub
// main.bicep  |  All Azure resources in one deploy
// ============================================================
// Deploy:
//   az deployment group create \
//     --resource-group rg-luminary-policyhub \
//     --template-file main.bicep \
//     --parameters @main.parameters.json
// ============================================================

targetScope = 'resourceGroup'

// ── Parameters ───────────────────────────────────────────────
@description('Environment suffix: dev | staging | prod')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Azure AD tenant ID for authentication')
param tenantId string

@description('App registration client ID (create before deploying)')
param appClientId string

@description('Object IDs of IT admin users/group')
param itAdminGroupObjectId string

@description('Object IDs of HR staff group')
param hrGroupObjectId string

@description('Object IDs of Compliance staff group')
param complianceGroupObjectId string

@description('Object IDs of Clinical leads group')
param clinicalLeadsGroupObjectId string

@description('Azure OpenAI region (must support GPT-4o — e.g. eastus)')
param openAiLocation string = 'eastus'

// ── Variables ─────────────────────────────────────────────────
var suffix = '${environment}-lh'
var storageAccountName = 'stpolicyhub${replace(suffix, '-', '')}'  // max 24 chars, lowercase
var searchServiceName = 'srch-policyhub-${suffix}'
var openAiAccountName = 'oai-policyhub-${suffix}'
var functionAppName = 'func-policyhub-${suffix}'
var staticWebAppName = 'swa-policyhub-${suffix}'
var appServicePlanName = 'asp-policyhub-${suffix}'
var keyVaultName = 'kv-policyhub-${suffix}'
var logAnalyticsName = 'log-policyhub-${suffix}'
var appInsightsName = 'appi-policyhub-${suffix}'

// ── Log Analytics workspace ───────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
  }
}

// ── Application Insights ─────────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ── Key Vault ─────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enabledForDeployment: false
    enabledForTemplateDeployment: false
    enabledForDiskEncryption: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// ── Storage Account ───────────────────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
    encryption: {
      services: {
        blob: { enabled: true }
        file: { enabled: true }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

// Blob service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 30 }
  }
}

// Containers
resource publishedContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'policies-published'
  properties: { publicAccess: 'None' }
}

resource draftContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'policies-draft'
  properties: { publicAccess: 'None' }
}

resource archiveContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'policies-archive'
  properties: { publicAccess: 'None' }
}

// ── Azure AI Search ───────────────────────────────────────────
resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  sku: { name: 'basic' }   // Basic: 2GB, 3 replicas, BAA-eligible
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http403'
      }
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// ── Azure OpenAI ──────────────────────────────────────────────
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: openAiAccountName
  location: openAiLocation
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    publicNetworkAccess: 'Enabled'
    customSubDomainName: openAiAccountName
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// GPT-4o deployment
resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'gpt-4o'
  sku: {
    name: 'Standard'
    capacity: 30  // 30K tokens per minute
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-11-20'
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// text-embedding-3-large for search indexing
resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'text-embedding-3-large'
  dependsOn: [gpt4oDeployment]
  sku: {
    name: 'Standard'
    capacity: 120  // 120K tokens per minute
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-large'
      version: '1'
    }
  }
}

// ── App Service Plan (for Function App) ───────────────────────
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }  // Consumption plan
  kind: 'functionapp'
  properties: { reserved: true }  // Linux
}

// ── Function App (API + indexer) ──────────────────────────────
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'STORAGE_ACCOUNT_NAME', value: storageAccount.name }
        { name: 'STORAGE_CONNECTION_STRING', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'SEARCH_ENDPOINT', value: 'https://${searchService.name}.search.windows.net' }
        { name: 'SEARCH_INDEX_NAME', value: 'policies' }
        { name: 'OPENAI_ENDPOINT', value: openAiAccount.properties.endpoint }
        { name: 'OPENAI_DEPLOYMENT_NAME', value: 'gpt-4o' }
        { name: 'OPENAI_EMBEDDING_DEPLOYMENT', value: 'text-embedding-3-large' }
        { name: 'TENANT_ID', value: tenantId }
        { name: 'APP_CLIENT_ID', value: appClientId }
        { name: 'IT_ADMIN_GROUP_ID', value: itAdminGroupObjectId }
        { name: 'HR_GROUP_ID', value: hrGroupObjectId }
        { name: 'COMPLIANCE_GROUP_ID', value: complianceGroupObjectId }
        { name: 'CLINICAL_LEADS_GROUP_ID', value: clinicalLeadsGroupObjectId }
      ]
      cors: {
        allowedOrigins: ['https://${staticWebAppName}.azurestaticapps.net']
        supportCredentials: true
      }
    }
    httpsOnly: true
  }
}

// ── Static Web App (frontend) ─────────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: 'eastus2'   // SWA has limited region availability
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    provider: 'GitHub'
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

// ── RBAC assignments ──────────────────────────────────────────

// Function App → Storage (Blob Data Contributor)
var storageBlobDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
resource funcStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, functionApp.id, storageBlobDataContributor)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDataContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App → Search (Search Index Data Contributor)
var searchIndexDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8ebe5a00-799e-43f5-93ac-243d3dce84a7')
resource funcSearchRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, functionApp.id, searchIndexDataContributor)
  scope: searchService
  properties: {
    roleDefinitionId: searchIndexDataContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App → Search (Search Service Contributor for index management)
var searchServiceContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7ca78c08-252a-4471-8644-bb5ff32d4ba0')
resource funcSearchServiceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, functionApp.id, searchServiceContributor)
  scope: searchService
  properties: {
    roleDefinitionId: searchServiceContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App → OpenAI (Cognitive Services OpenAI User)
var openAiUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
resource funcOpenAiRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAiAccount.id, functionApp.id, openAiUser)
  scope: openAiAccount
  properties: {
    roleDefinitionId: openAiUser
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App → Key Vault (Secrets User)
var keyVaultSecretsUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
resource funcKeyVaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, keyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: keyVaultSecretsUser
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// IT Admin group → Storage (Blob Data Contributor — upload/manage)
resource itStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, itAdminGroupObjectId, storageBlobDataContributor)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDataContributor
    principalId: itAdminGroupObjectId
    principalType: 'Group'
  }
}

// HR group → Storage (Blob Data Contributor — upload/manage)
resource hrStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, hrGroupObjectId, storageBlobDataContributor)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDataContributor
    principalId: hrGroupObjectId
    principalType: 'Group'
  }
}

// Compliance group → Storage (Blob Data Contributor — upload/manage)
resource complianceStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, complianceGroupObjectId, storageBlobDataContributor)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDataContributor
    principalId: complianceGroupObjectId
    principalType: 'Group'
  }
}

// ── Outputs ───────────────────────────────────────────────────
output storageAccountName string = storageAccount.name
output searchServiceName string = searchService.name
output searchEndpoint string = 'https://${searchService.name}.search.windows.net'
output openAiEndpoint string = openAiAccount.properties.endpoint
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output keyVaultName string = keyVault.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
