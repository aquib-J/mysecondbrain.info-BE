import { DataTypes, Model } from 'sequelize';
import sequelize from './sequelizeConnect.js';


// User Model
class User extends Model { }
User.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    password_hash: {
        type: DataTypes.CHAR(64),
        allowNull: false
    },
    metadata: {
        type: DataTypes.JSON
    },
    signup_ip_address: {
        type: DataTypes.STRING(45)
    },
    signup_user_location: {
        type: DataTypes.STRING(45)
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

// RefreshToken Model
class RefreshToken extends Model { }
RefreshToken.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    refresh_token: {
        type: DataTypes.STRING(512),
        allowNull: false
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    sequelize,
    modelName: 'RefreshToken',
    tableName: 'refresh_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

// Document Model
class Document extends Model { }
Document.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    file_type: {
        type: DataTypes.ENUM('pdf', 'doc', 'docx', 'json', 'txt'),
        allowNull: false
    },
    filename: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    filesize: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    },
    pages: {
        type: DataTypes.INTEGER.UNSIGNED
    },
    uploaded_by: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    s3_upload_url: { // presigned url of the uploaded file valid for 1 hour
        type: DataTypes.STRING(512),
        allowNull: false
    },
    deleted_at: {
        type: DataTypes.DATE
    },
    status: {
        type: DataTypes.ENUM('active', 'deleted'),
        defaultValue: 'active'
    }
}, {
    sequelize,
    modelName: 'Document',
    tableName: 'documents',
    timestamps: true,
    createdAt: 'uploaded_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

// Job Model
class Job extends Model { }
Job.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    doc_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    job_type: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    service: {
        type: DataTypes.STRING(16),
        defaultValue: 'secondbrain'
    },
    resource: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'in_progress', 'success', 'failed', 'cancelled'),
        defaultValue: 'pending'
    },
    metadata: {
        type: DataTypes.JSON
    },
    started_at: {
        type: DataTypes.DATE
    },
    completed_at: {
        type: DataTypes.DATE
    },
    cancelled_at: {
        type: DataTypes.DATE
    },
    output: {
        type: DataTypes.JSON
    },
    error_message: {
        type: DataTypes.TEXT
    }
}, {
    sequelize,
    modelName: 'Job',
    tableName: 'jobs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'modified_at'
});

// Vector Model
class Vector extends Model { }
Vector.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    job_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    vector_id: {
        type: DataTypes.BLOB,
        allowNull: false
    },
    embedding_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    text_content: {
        type: DataTypes.TEXT
    },
    embedding: {
        type: DataTypes.JSON,
        allowNull: false
    },
    metadata: {
        type: DataTypes.JSON
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    status: {
        type: DataTypes.ENUM('in_progress', 'success', 'failed'),
        defaultValue: 'in_progress'
    }
}, {
    sequelize,
    modelName: 'Vector',
    tableName: 'vectors',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'modified_at'
});

// AIProvider Model
class AIProvider extends Model { }
AIProvider.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    provider: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    task: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    model: {
        type: DataTypes.STRING(36),
        allowNull: false
    }
}, {
    sequelize,
    modelName: 'AIProvider',
    tableName: 'ai_providers',
    timestamps: true,
    createdAt: 'created_at'
});

// Define relationships
User.hasMany(RefreshToken, { foreignKey: 'user_id' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Document, { foreignKey: 'uploaded_by' });
Document.belongsTo(User, { foreignKey: 'uploaded_by' });

Document.hasMany(Job, { foreignKey: 'doc_id' });
Job.belongsTo(Document, { foreignKey: 'doc_id', as: 'document' });

Job.hasMany(Vector, { foreignKey: 'job_id' });
Vector.belongsTo(Job, { foreignKey: 'job_id' });

Vector.belongsTo(AIProvider, { foreignKey: 'embedding_id' });
AIProvider.hasMany(Vector, { foreignKey: 'embedding_id' });

// Chat Model
class Chat extends Model { }
Chat.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    chat_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('user', 'system'),
        defaultValue: 'user',
        allowNull: false
    },
    metadata: {
        type: DataTypes.JSON,
        defaultValue: {}
    },
    messages: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    status: {
        type: DataTypes.ENUM('active', 'deleted'),
        defaultValue: 'active'
    },
    deleted_at: {
        type: DataTypes.DATE
    }
}, {
    sequelize,
    modelName: 'Chat',
    tableName: 'chats',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

// Define relationships for Chat
User.hasMany(Chat, { foreignKey: 'user_id' });
Chat.belongsTo(User, { foreignKey: 'user_id' });

export {
    User,
    RefreshToken,
    Document,
    Job,
    Vector,
    AIProvider,
    Chat
};
