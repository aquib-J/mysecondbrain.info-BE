import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'MySecondBrain API',
            version: '1.0.0',
            description: 'API documentation for the MySecondBrain platform',
            contact: {
                name: 'API Support',
                email: 'aquib.jansher@gmail.com'
            }
        },
        servers: [
            {
                url: 'http://localhost:3500/api/v1',
                description: 'Development server'
            }
        ],
        components: {
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Username for the user'
                        },
                        userId: {
                            type: 'string',
                            description: 'Unique identifier for the user'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address'
                        },
                        password: {
                            type: 'string',
                            format: 'password',
                            description: 'User password (never returned in responses)'
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time'
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                Document: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 123 },
                        file_type: {
                            type: 'string',
                            enum: ['pdf', 'doc', 'docx', 'json', 'txt'],
                            example: 'pdf'
                        },
                        filename: { type: 'string', example: 'report.pdf' },
                        filesize: { type: 'integer', example: 1048576 },
                        pages: { type: 'integer', example: 42 },
                        uploaded_by: { type: 'integer', example: 456 },
                        status: {
                            type: 'string',
                            enum: ['pending', 'processing', 'completed', 'failed'],
                            example: 'completed'
                        },
                        created_at: { type: 'string', format: 'date-time' },
                        updated_at: { type: 'string', format: 'date-time' }
                    }
                },
                Chat: {
                    type: 'object',
                    properties: {
                        chatId: {
                            type: 'string',
                            description: 'Unique identifier for the chat thread'
                        },
                        title: {
                            type: 'string',
                            description: 'Title of the chat thread'
                        },
                        userId: {
                            type: 'string',
                            description: 'ID of the user who owns the chat'
                        },
                        status: {
                            type: 'string',
                            enum: ['active', 'inactive'],
                            description: 'Current status of the chat'
                        },
                        messages: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: {
                                        type: 'string',
                                        enum: ['user', 'system'],
                                        description: 'Type of message'
                                    },
                                    content: {
                                        type: 'string',
                                        description: 'Message content in markdown format'
                                    },
                                    timestamp: {
                                        type: 'string',
                                        format: 'date-time',
                                        description: 'When the message was created'
                                    }
                                }
                            }
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time'
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        token: {
                            type: 'string',
                            description: 'JWT authentication token'
                        },
                        user: {
                            $ref: '#/components/schemas/User'
                        }
                    }
                },
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'success' },
                        data: { type: 'object' },
                        code: { type: 'integer', example: 200 },
                        extra: {
                            type: 'object',
                            properties: {
                                pagination: {
                                    type: 'object',
                                    properties: {
                                        currentPage: { type: 'integer', example: 1 },
                                        limit: { type: 'integer', example: 10 },
                                        total: { type: 'integer', example: 100 },
                                        nextPage: { type: 'integer', nullable: true, example: 2 }
                                    }
                                }
                            }
                        }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Authentication failed' },
                        code: { type: 'integer', example: 401 },
                        resCode: { type: 'integer', example: 'AUTH_001' },
                        extra: {
                            type: 'object',
                            properties: {
                                stacks: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            service: { type: 'string' },
                                            stack: { type: 'array', items: { type: 'string' } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token obtained from /auth/login'
                }
            }
        },
        tags: [
            {
                name: 'Auth',
                description: 'Authentication endpoints'
            },
            {
                name: 'Documents',
                description: 'Document management endpoints'
            },
            {
                name: 'Chats',
                description: 'Chat and conversation endpoints'
            },
            {
                name: 'System',
                description: 'System health and status endpoints'
            }
        ],
        paths: {
            '/auth/signup': {
                post: {
                    tags: ['Auth'],
                    summary: 'Register a new user',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['username', 'email', 'password'],
                                    properties: {
                                        username: {
                                            type: 'string',
                                            description: 'Username for the user'
                                        },
                                        email: {
                                            type: 'string',
                                            format: 'email'
                                        },
                                        password: {
                                            type: 'string',
                                            format: 'password'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'User created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/AuthResponse'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Login user',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email', 'password'],
                                    properties: {
                                        email: {
                                            type: 'string',
                                            format: 'email'
                                        },
                                        password: {
                                            type: 'string',
                                            format: 'password'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Login successful',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/AuthResponse'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/auth/logout': {
                get: {
                    tags: ['Auth'],
                    summary: 'Logout user',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': {
                            description: 'Logout successful'
                        }
                    }
                }
            },
            '/documents/upload': {
                post: {
                    tags: ['Documents'],
                    summary: 'Upload a new document',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
                                    required: ['file'],
                                    properties: {
                                        file: {
                                            type: 'string',
                                            format: 'binary',
                                            description: 'Document file to upload'
                                        },
                                        filetype: {
                                            type: 'string',
                                            description: 'Type of the file (e.g., json, pdf, txt, doc)',
                                            enum: ['application/json', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
                                        },
                                        filename: {
                                            type: 'string',
                                            description: 'Name of the file'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Document uploaded successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/SuccessResponse',
                                        example: {
                                            success: true,
                                            message: 'Document uploaded',
                                            data: {
                                                id: 123,
                                                filename: 'report.pdf',
                                                status: 'processing'
                                            },
                                            code: 201
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/documents/list': {
                get: {
                    tags: ['Documents'],
                    summary: 'List all documents',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'query',
                            name: 'page',
                            schema: {
                                type: 'integer',
                                default: 1
                            }
                        },
                        {
                            in: 'query',
                            name: 'pageSize',
                            schema: {
                                type: 'integer',
                                default: 10
                            }
                        },
                        {
                            in: 'query',
                            name: 'search',
                            schema: {
                                type: 'string',
                                description: 'document name to search for'
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'List of documents',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            documents: {
                                                type: 'array',
                                                items: {
                                                    $ref: '#/components/schemas/Document'
                                                }
                                            },
                                            total: {
                                                type: 'integer'
                                            },
                                            page: {
                                                type: 'integer'
                                            },
                                            limit: {
                                                type: 'integer'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/documents/status/{documentId}': {
                get: {
                    tags: ['Documents'],
                    summary: 'Get document status',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'documentId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Document status',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Document'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/documents/download/{documentId}': {
                get: {
                    tags: ['Documents'],
                    summary: 'Download a document',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'documentId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Document file',
                            content: {
                                'application/octet-stream': {
                                    schema: {
                                        type: 'string',
                                        format: 'binary'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/documents/delete/{documentId}': {
                delete: {
                    tags: ['Documents'],
                    summary: 'Delete a document',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'documentId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Document deleted successfully'
                        }
                    }
                }
            },
            '/chats': {
                post: {
                    tags: ['Chats'],
                    summary: 'Create a new chat',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    required: ['query'],
                                    properties: {
                                        query: {
                                            type: 'string',
                                            description: 'Initial query to start the chat',
                                            example: 'Explain quantum computing'
                                        },
                                        title: {
                                            type: 'string',
                                            description: 'Optional chat title',
                                            example: 'Quantum Computing Discussion'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Chat created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/SuccessResponse',
                                        example: {
                                            success: true,
                                            message: 'Chat created',
                                            data: {
                                                chatId: '550e8400-e29b-41d4-a716-446655440000',
                                                title: 'Quantum Computing Discussion',
                                                messages: []
                                            },
                                            code: 201
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                get: {
                    tags: ['Chats'],
                    summary: 'List all chats',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'query',
                            name: 'page',
                            schema: {
                                type: 'integer',
                                default: 1
                            }
                        },
                        {
                            in: 'query',
                            name: 'pageSize',
                            schema: {
                                type: 'integer',
                                default: 10
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'List of chats',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            chats: {
                                                type: 'array',
                                                items: {
                                                    $ref: '#/components/schemas/Chat'
                                                }
                                            },
                                            total: {
                                                type: 'integer'
                                            },
                                            page: {
                                                type: 'integer'
                                            },
                                            limit: {
                                                type: 'integer'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/chats/{chatId}': {
                get: {
                    tags: ['Chats'],
                    summary: 'Get chat details',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'chatId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Chat details',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Chat'
                                    }
                                }
                            }
                        }
                    }
                },
                delete: {
                    tags: ['Chats'],
                    summary: 'Delete a chat',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'chatId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Chat deleted successfully'
                        }
                    }
                }
            },
            '/chats/{chatId}/query': {
                post: {
                    tags: ['Chats'],
                    summary: 'Send a query in an existing chat',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'chatId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['query'],
                                    properties: {
                                        query: {
                                            type: 'string'
                                        },
                                        documentId: {
                                            type: 'string',
                                            description: 'Optional specific document to search against'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Query response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            response: {
                                                type: 'string',
                                                description: 'AI response in markdown format'
                                            },
                                            sources: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        documentId: {
                                                            type: 'string'
                                                        },
                                                        title: {
                                                            type: 'string'
                                                        },
                                                        relevance: {
                                                            type: 'number'
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/chats/{chatId}/title': {
                put: {
                    tags: ['Chats'],
                    summary: 'Update chat title',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'chatId',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['title'],
                                    properties: {
                                        title: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Chat title updated successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Chat'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/chats/structured-query': {
                post: {
                    tags: ['Chats'],
                    summary: 'Perform a structured query on JSON documents',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['filters'],
                                    properties: {
                                        filters: {
                                            type: 'object',
                                            description: 'Query filters'
                                        },
                                        aggregations: {
                                            type: 'object',
                                            description: 'Optional aggregations'
                                        },
                                        documentId: {
                                            type: 'string',
                                            description: 'Optional specific document to query'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Query results',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            results: {
                                                type: 'array',
                                                items: {
                                                    type: 'object'
                                                }
                                            },
                                            aggregations: {
                                                type: 'object'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/health': {
                get: {
                    tags: ['System'],
                    summary: 'System health check',
                    responses: {
                        '200': {
                            description: 'Health status',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/SuccessResponse',
                                        example: {
                                            success: true,
                                            message: 'Application is running',
                                            data: {
                                                status: 'OK',
                                                db: 'connected',
                                                weaviate: 'available'
                                            },
                                            code: 200
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    apis: ['./routes/*.js', './routes/**/*.js']
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app) {
    // Serve swagger docs
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: "MySecondBrain API Documentation"
    }));

    // Serve swagger spec as JSON
    app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(specs);
    });
} 