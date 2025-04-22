#!/usr/bin/env node

// Script to import Sourcegraph site configuration and code host configurations
// Usage: node import-config.js <target-sourcegraph-url> <access-token> <input-directory>

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: node import-config.js <target-sourcegraph-url> <access-token> <input-directory>');
  process.exit(1);
}

const [targetUrl, accessToken, inputDir] = args;

// Validate input directory
if (!fs.existsSync(inputDir)) {
  console.error(`Input directory does not exist: ${inputDir}`);
  process.exit(1);
}

// Required files
const siteConfigPath = path.join(inputDir, 'site-config.json');
const externalServicesPath = path.join(inputDir, 'external-services.json');

if (!fs.existsSync(siteConfigPath)) {
  console.error(`Site configuration file not found: ${siteConfigPath}`);
  process.exit(1);
}

if (!fs.existsSync(externalServicesPath)) {
  console.error(`External services file not found: ${externalServicesPath}`);
  process.exit(1);
}

// Remove trailing slash from URL if present
const baseUrl = targetUrl.replace(/\/$/, '');

// GraphQL endpoint
const graphqlEndpoint = `${baseUrl}/.api/graphql`;

// Execute a GraphQL query
async function executeQuery(query, variables = {}) {
  const url = new URL(graphqlEndpoint);
  const httpModule = url.protocol === 'https:' ? https : http;
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      query,
      variables
    });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${accessToken}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = httpModule.request(url, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP Error: ${res.statusCode} ${responseData}`));
        }
        
        try {
          const parsedData = JSON.parse(responseData);
          if (parsedData.errors && parsedData.errors.length > 0) {
            return reject(new Error(`GraphQL Error: ${parsedData.errors[0].message}`));
          }
          resolve(parsedData.data);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });
    
    req.write(data);
    req.end();
  });
}

// Get the current site configuration to retrieve the latest ID
async function getCurrentSiteConfigId() {
  console.log('Getting current site configuration ID...');
  
  const query = `
    query {
      site {
        configuration {
          id
        }
      }
    }
  `;
  
  const data = await executeQuery(query);
  
  if (!data?.site?.configuration?.id) {
    throw new Error('Failed to retrieve current site configuration ID');
  }
  
  return data.site.configuration.id;
}

// Import external services (code host configurations)
async function importExternalServices() {
  console.log('Importing code host configurations...');
  
  // Read the exported external services
  const services = JSON.parse(fs.readFileSync(externalServicesPath, 'utf8'));
  
  // Get current external services to avoid duplicates
  const query = `
    query {
      externalServices {
        nodes {
          id
          displayName
          kind
        }
      }
    }
  `;
  
  const data = await executeQuery(query);
  const existingServices = data?.externalServices?.nodes || [];
  
  console.log(`Found ${existingServices.length} existing code host configurations.`);
  
  let added = 0;
  let skipped = 0;
  
  // Process each service
  for (const service of services) {
    // Check if a service with the same display name and kind already exists
    const existingService = existingServices.find(s => 
      s.displayName === service.displayName && s.kind === service.kind);
    
    if (existingService) {
      console.log(`Skipping existing service: ${service.displayName} (${service.kind})`);
      skipped++;
      continue;
    }
    
    // Add the new external service
    const mutation = `
      mutation AddExternalService($input: AddExternalServiceInput!) {
        addExternalService(input: $input) {
          id
        }
      }
    `;
    
    const variables = {
      input: {
        displayName: service.displayName,
        kind: service.kind,
        config: service.config
      }
    };
    
    await executeQuery(mutation, variables);
    console.log(`Added service: ${service.displayName} (${service.kind})`);
    added++;
  }
  
  console.log(`\nImported ${added} code host configurations (${skipped} skipped).`);
}

// Main function to import all configurations
async function main() {
  try {
    // Create a timestamped import summary
    const summary = {
      timestamp: new Date().toISOString(),
      targetUrl: baseUrl,
      status: 'started'
    };
    
    // Then import external services
    await importExternalServices();
    
    // Update and save the summary
    summary.status = 'completed';
    
    const summaryPath = path.join(inputDir, 'import-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\nImport completed successfully!');
    console.log(`Summary written to ${summaryPath}`);
  } catch (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

main();