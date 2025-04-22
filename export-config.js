#!/usr/bin/env node

// Script to export Sourcegraph site configuration and code host configurations
// Usage: node export-config.js <sourcegraph-url> <access-token> <output-directory>

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: node export-config.js <sourcegraph-url> <access-token> <output-directory>');
  process.exit(1);
}

const [sourcegraphUrl, accessToken, outputDir] = args;

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Remove trailing slash from URL if present
const baseUrl = sourcegraphUrl.replace(/\/$/, '');

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

// Export site configuration
async function exportSiteConfig() {
  console.log('Exporting site configuration...');
  
  const query = `
    query {
      site {
        configuration {
          id
          effectiveContents
        }
      }
    }
  `;
  
  const data = await executeQuery(query);
  
  if (!data?.site?.configuration) {
    throw new Error('Failed to retrieve site configuration');
  }
  
  // Sourcegraph GraphQL mutations won't accept a config with REDACTED as a string value
  const sanitizedData = JSON.parse(JSON.stringify(data).replaceAll("REDACTED", "NEEDS_UPDATING"))

  const configPath = path.join(outputDir, 'site-config.json');
  const config = sanitizedData.site.configuration.effectiveContents
  fs.writeFileSync(configPath, config);
  console.log(`Site configuration exported to ${configPath}`);
  
  return config.id;
}

// Export external services (code host configurations)
async function exportExternalServices() {
  console.log('Exporting code host configurations...');
  
  const query = `
    query {
      externalServices {
        nodes {
          id
          kind
          displayName
          config
        }
      }
    }
  `;
  
  const data = await executeQuery(query);
  if (!data?.externalServices?.nodes) {
    throw new Error('Failed to retrieve external services');
  }

  // Sourcegraph GraphQL mutations won't accept a config with REDACTED as a string value
  const sanitizedData = JSON.parse(JSON.stringify(data).replaceAll("REDACTED", "NEEDS_UPDATING"))
  
  const servicesPath = path.join(outputDir, 'external-services.json');
  const services = sanitizedData.externalServices.nodes;
  
  fs.writeFileSync(servicesPath, JSON.stringify(services, null, 2));
  console.log(`${services.length} code host configurations exported to ${servicesPath}`);
  
  return services;
}

// Main function to export all configurations
async function main() {
  try {
    const siteConfigId = await exportSiteConfig();
    const externalServices = await exportExternalServices();
    
    const summary = {
      timestamp: new Date().toISOString(),
      sourcegraphUrl: baseUrl,
      siteConfigId: siteConfigId,
      externalServicesCount: externalServices.length
    };
    
    const summaryPath = path.join(outputDir, 'export-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\nExport completed successfully!');
    console.log(`Summary written to ${summaryPath}`);
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

main();