
/**
 * Helper class for building Weaviate GraphQL queries
 */
class WeaviateQueryBuilder {
    /**
     * Build a similarity search query
     * @param {Object} params - Search parameters
     * @param {string} params.className - Name of the class to search in
     * @param {string} params.tenantId - Tenant ID
     * @param {Array<number>} params.vector - Query vector
     * @param {number} params.limit - Maximum number of results
     * @param {number} params.documentId - Optional document ID filter
     * @returns {string} - GraphQL query
     */
    buildSimilaritySearchQuery(params) {
        const { className, tenantId, vector, limit, documentId } = params;

        // Build GraphQL query
        let query = `{ Get { ${className}`;
        const queryParams = [];

        // Add tenant
        queryParams.push(`tenant: "${tenantId}"`);

        // Add nearVector
        queryParams.push(`nearVector: { vector: ${JSON.stringify(vector)}, distance: 0.8 }`);

        // Add limit
        queryParams.push(`limit: ${limit}`);

        // Add where filter if documentId is provided
        if (documentId) {
            queryParams.push(`where: { path: ["documentId"], operator: Equal, valueInt: ${documentId} }`);
        }

        // Add parameters to query
        if (queryParams.length > 0) {
            query += `(${queryParams.join(', ')})`;
        }

        // Add fields to retrieve
        query += `{ text metadata jobId documentId vectorId pageNumber chunkIndex userId _additional { distance } } } }`;

        return query;
    }

    /**
     * Build a structured query for JSON documents
     * @param {Object} params - Query parameters
     * @param {string} params.className - Name of the class to query
     * @param {string} params.tenantId - Tenant ID
     * @param {string} params.field - Field to query
     * @param {number} params.documentId - Optional document ID filter
     * @returns {string} - GraphQL query
     */
    buildStructuredQuery(params) {
        const { className, tenantId, field, documentId } = params;

        // Build GraphQL query
        let query = `{ 
  Get { 
    ${className}(
      tenant: "${tenantId}"`;

        // Build where clause
        let whereClause = {
            operator: 'And',
            operands: [
                {
                    path: ['path'],
                    operator: 'Equal',
                    valueString: field
                },
                {
                    path: ['valueType'],
                    operator: 'Equal',
                    valueString: 'number'
                }
            ]
        };

        // Add document ID filter if provided
        if (documentId) {
            whereClause.operands.push({
                path: ['documentId'],
                operator: 'Equal',
                valueInt: documentId
            });
        }

        // Convert the whereClause to a properly formatted string
        const whereStr = JSON.stringify(whereClause)
            .replace(/"([^"]+)":/g, '$1:')  // Remove quotes around property names
            .replace(/"Equal"/g, 'Equal')   // Remove quotes around operators
            .replace(/"And"/g, 'And')
            .replace(/"Or"/g, 'Or');

        query += `,
      where: ${whereStr},
      limit: 1000
    ) { 
      path 
      value 
      valueType 
      documentId 
      metadata 
    } 
  }
}`;

        return query;
    }

    /**
     * Build a group by field query
     * @param {Object} params - Query parameters
     * @param {string} params.className - Name of the class to query
     * @param {string} params.tenantId - Tenant ID
     * @param {string} params.groupByField - Field to group by
     * @returns {string} - GraphQL query
     */
    buildGroupByQuery(params) {
        const { className, tenantId, groupByField } = params;

        // Build GraphQL query
        let query = `{ Get { ${className}`;
        const queryParams = [];

        // Add tenant
        queryParams.push(`tenant: "${tenantId}"`);

        // Add where clause for groupBy field
        queryParams.push(`where: { path: ["path"], operator: Equal, valueString: "${groupByField}" }`);

        // Add limit
        queryParams.push(`limit: 1000`);

        // Add parameters to query
        if (queryParams.length > 0) {
            query += `(${queryParams.join(', ')})`;
        }

        // Add fields to retrieve
        query += `{ path value documentId } } }`;

        return query;
    }

    /**
     * Build a delete mutation
     * @param {Object} params - Delete parameters
     * @param {string} params.className - Name of the class to delete from
     * @param {string} params.tenantId - Tenant ID
     * @param {string} params.field - Field to filter on
     * @param {string} params.operator - Operator to use
     * @param {any} params.value - Value to filter on
     * @returns {string} - GraphQL mutation
     */
    buildDeleteMutation(params) {
        const { className, tenantId, field, operator, value } = params;

        // Determine the value type parameter
        let valueParam = '';
        if (typeof value === 'number') {
            valueParam = `valueInt: ${value}`;
        } else if (typeof value === 'string') {
            valueParam = `valueString: "${value}"`;
        } else {
            valueParam = `valueText: "${String(value)}"`;
        }

        // Build the GraphQL mutation
        const mutation = `mutation { 
            Delete { 
                ${className}(
                    tenant: "${tenantId}", 
                    where: { path: ["${field}"], operator: ${operator}, ${valueParam} }
                ) { success } 
            } 
        }`;

        return mutation;
    }
}

export default new WeaviateQueryBuilder(); 