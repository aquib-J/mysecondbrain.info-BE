import Logger from '../../utils/Logger.js';
import weaviateClient from '../../databases/weaviate/weaviate-client.js';

const logger = new Logger();

/**
 * Helper class for managing Weaviate schema
 */
class WeaviateSchemaManager {
    /**
     * Get class definitions for Document and JsonDocument
     * @returns {Object} - Object containing class definitions
     */
    getClassDefinitions() {
        return {
            Document: {
                class: 'Document',
                vectorizer: 'none', // We'll provide our own vectors
                properties: [
                    {
                        name: 'text',
                        dataType: ['text'],
                        description: 'The text content of the document chunk',
                    },
                    {
                        name: 'metadata',
                        dataType: ['text'], // Store metadata as JSON string
                        description: 'Metadata about the document chunk',
                    },
                    {
                        name: 'jobId',
                        dataType: ['int'],
                        description: 'ID of the job that processed this document',
                    },
                    {
                        name: 'documentId',
                        dataType: ['int'],
                        description: 'ID of the document this chunk belongs to',
                    },
                    {
                        name: 'vectorId',
                        dataType: ['text'],
                        description: 'ID of the vector in the database',
                    },
                    {
                        name: 'pageNumber',
                        dataType: ['int'],
                        description: 'Page number in the original document',
                    },
                    {
                        name: 'chunkIndex',
                        dataType: ['int'],
                        description: 'Index of this chunk within the document',
                    },
                    {
                        name: 'userId',
                        dataType: ['int'],
                        description: 'ID of the user who owns this document',
                        indexInverted: true
                    }
                ],
                multiTenancyConfig: {
                    enabled: true
                }
            },
            JsonDocument: {
                class: 'JsonDocument',
                vectorizer: 'none', // We'll provide vectors explicitly
                properties: [
                    {
                        name: 'text',
                        dataType: ['text'],
                        description: 'The text representation of the JSON field'
                    },
                    {
                        name: 'path',
                        dataType: ['text'],
                        description: 'The path to the field in the JSON object',
                        indexInverted: true
                    },
                    {
                        name: 'value',
                        dataType: ['text'],
                        description: 'The raw string value of the field',
                        indexInverted: true
                    },
                    {
                        name: 'valueType',
                        dataType: ['text'],
                        description: 'The data type of the value (string, number, boolean, etc.)',
                        indexInverted: true
                    },
                    {
                        name: 'documentId',
                        dataType: ['int'],
                        description: 'The ID of the document this vector belongs to',
                        indexInverted: true
                    },
                    {
                        name: 'metadata',
                        dataType: ['text'],
                        description: 'Additional metadata about the field',
                        indexInverted: true
                    },
                    {
                        name: 'userId',
                        dataType: ['int'],
                        description: 'ID of the user who owns this document',
                        indexInverted: true
                    }
                ],
                multiTenancyConfig: {
                    enabled: true
                }
            }
        };
    }

    /**
     * Initialize class in Weaviate
     * @param {string} className - Name of the class to initialize
     * @returns {Promise<void>}
     */
    async initializeClass(className) {
        try {
            // Get class definition
            const classDefinitions = this.getClassDefinitions();
            const definition = classDefinitions[className];
            if (!definition) {
                throw new Error(`Class definition not found for ${className}`);
            }

            // Check if class exists
            let classExists = false;
            try {
                const schema = await weaviateClient.getSchema();
                const existingClasses = schema.classes || [];
                classExists = existingClasses.some(c => c.class === className);
            } catch (err) {
                logger.warn(`Error checking if class exists: ${err.message}`);
            }

            if (!classExists) {
                // Create class if it doesn't exist
                await weaviateClient.createClass(definition);
                logger.info(`${className} class created in Weaviate with multi-tenancy enabled`);
            } else {
                // If class exists but multi-tenancy is not enabled, update it
                try {
                    const classInfo = await weaviateClient.getClass(className);

                    if (!classInfo.multiTenancyConfig?.enabled) {
                        logger.info(`Updating ${className} class to enable multi-tenancy`);
                        await weaviateClient.updateClass(className, {
                            multiTenancyConfig: { enabled: true }
                        });
                    }
                } catch (err) {
                    logger.warn(`Could not check/update multi-tenancy config: ${err.message}`);
                }
            }
        } catch (error) {
            logger.error(`Error initializing ${className} class schema`, { error });
            throw error;
        }
    }

    /**
     * Ensure a tenant exists for a class
     * @param {string} className - Name of the class
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<boolean>} - True if tenant exists or was created
     */
    async ensureTenantExists(className, tenantId) {
        try {
            // Get all tenants for the class
            const tenants = await weaviateClient.getTenants(className);

            // Check if the tenant already exists
            const tenantExists = tenants.some(tenant => tenant.name === tenantId);

            if (!tenantExists) {
                logger.info(`Creating tenant ${tenantId} for class ${className}`);

                // Create the tenant - must be in an array
                await weaviateClient.createTenants(className, [
                    { name: tenantId }
                ]);

                logger.info(`Tenant ${tenantId} created successfully for class ${className}`);
            } else {
                logger.debug(`Tenant ${tenantId} already exists for class ${className}`);
            }

            return true;
        } catch (error) {
            logger.error(`Error ensuring tenant exists for class ${className}`, { error });
            throw error;
        }
    }
}

export default new WeaviateSchemaManager(); 