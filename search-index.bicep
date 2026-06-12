// search-index.bicep
// Run AFTER main.bicep — creates the policies search index
// This uses a deploymentScript resource to call the Search REST API
// since Bicep doesn't have a native Search Index resource type.
//
// Deploy:
//   az deployment group create \
//     --resource-group rg-luminary-policyhub \
//     --template-file search-index.bicep \
//     --parameters searchServiceName=srch-policyhub-prod-lh

targetScope = 'resourceGroup'

param searchServiceName string
param location string = resourceGroup().location
param identityName string = 'id-deploy-${uniqueString(resourceGroup().id)}'

// User-assigned managed identity for the deployment script
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

// Grant the identity Search Service Contributor on the search service
var searchServiceContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7ca78c08-252a-4471-8644-bb5ff32d4ba0')
resource identitySearchRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceId('Microsoft.Search/searchServices', searchServiceName), deployIdentity.id, searchServiceContributor)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: searchServiceContributor
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Deployment script that creates the index via REST API
resource createSearchIndex 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: 'create-policies-index'
  location: location
  dependsOn: [identitySearchRole]
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${deployIdentity.id}': {}
    }
  }
  properties: {
    azCliVersion: '2.50.0'
    retentionInterval: 'P1D'
    scriptContent: '''
      # Get search admin key
      SEARCH_KEY=$(az search admin-key show \
        --service-name ${SEARCH_SERVICE_NAME} \
        --resource-group ${RESOURCE_GROUP} \
        --query primaryKey -o tsv)

      ENDPOINT="https://${SEARCH_SERVICE_NAME}.search.windows.net"

      # Create the policies index
      curl -X PUT \
        "${ENDPOINT}/indexes/policies?api-version=2023-11-01" \
        -H "Content-Type: application/json" \
        -H "api-key: ${SEARCH_KEY}" \
        -d '{
          "name": "policies",
          "fields": [
            { "name": "id",            "type": "Edm.String", "key": true,  "filterable": true },
            { "name": "policyNumber",  "type": "Edm.String", "filterable": true, "sortable": true, "facetable": true },
            { "name": "title",         "type": "Edm.String", "searchable": true, "sortable": true },
            { "name": "category",      "type": "Edm.String", "filterable": true, "facetable": true },
            { "name": "subCategory",   "type": "Edm.String", "filterable": true, "facetable": true },
            { "name": "owner",         "type": "Edm.String", "filterable": true, "facetable": true },
            { "name": "status",        "type": "Edm.String", "filterable": true, "facetable": true },
            { "name": "effectiveDate", "type": "Edm.DateTimeOffset", "filterable": true, "sortable": true },
            { "name": "reviewDate",    "type": "Edm.DateTimeOffset", "filterable": true, "sortable": true },
            { "name": "legalReview",   "type": "Edm.Boolean", "filterable": true },
            { "name": "corridorRef",   "type": "Edm.String", "filterable": true },
            { "name": "chapStandard",  "type": "Edm.String", "filterable": true },
            { "name": "scope",         "type": "Edm.String", "searchable": true },
            { "name": "purpose",       "type": "Edm.String", "searchable": true },
            { "name": "policyText",    "type": "Edm.String", "searchable": true },
            { "name": "procedureText", "type": "Edm.String", "searchable": true },
            { "name": "fullText",      "type": "Edm.String", "searchable": true },
            { "name": "blobUrl",       "type": "Edm.String" },
            { "name": "blobPath",      "type": "Edm.String" },
            { "name": "contentVector", "type": "Collection(Edm.Single)", "searchable": true, "dimensions": 3072, "vectorSearchProfile": "hnsw-profile" }
          ],
          "vectorSearch": {
            "algorithms": [{
              "name": "hnsw-algo",
              "kind": "hnsw",
              "hnswParameters": { "metric": "cosine", "m": 4, "efConstruction": 400, "efSearch": 500 }
            }],
            "profiles": [{
              "name": "hnsw-profile",
              "algorithm": "hnsw-algo"
            }]
          },
          "semantic": {
            "defaultConfiguration": "policy-semantic",
            "configurations": [{
              "name": "policy-semantic",
              "prioritizedFields": {
                "titleField": { "fieldName": "title" },
                "contentFields": [
                  { "fieldName": "policyText" },
                  { "fieldName": "procedureText" },
                  { "fieldName": "purpose" }
                ],
                "keywordsFields": [
                  { "fieldName": "policyNumber" },
                  { "fieldName": "category" },
                  { "fieldName": "chapStandard" }
                ]
              }
            }]
          },
          "scoringProfiles": [{
            "name": "policy-scoring",
            "text": {
              "weights": {
                "title": 5,
                "policyNumber": 5,
                "policyText": 3,
                "procedureText": 2,
                "purpose": 2,
                "scope": 1
              }
            }
          }],
          "defaultScoringProfile": "policy-scoring"
        }'

      echo "Index creation complete"
    '''
    environmentVariables: [
      { name: 'SEARCH_SERVICE_NAME', value: searchServiceName }
      { name: 'RESOURCE_GROUP', value: resourceGroup().name }
    ]
  }
}
