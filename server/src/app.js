require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const logger = require('./middleware/logger');
const { errorHandler, notFound } = require('./middleware/error');
const authRoutes = require('./routes/auth');
const calculationRoutes = require('./routes/calculations');

const app = express();
const PORT = process.env.PORT || 3000;

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '个人所得税计算系统 API',
            version: '1.0.0',
            description: '个人所得税计算系统的后端API文档',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: '开发服务器'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);
app.use('/api/calculations', calculationRoutes);

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '个人所得税计算系统 API 服务已启动',
        version: '1.0.0',
        docs: `/api/docs`
    });
});

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`API文档地址: http://localhost:${PORT}/api/docs`);
});
