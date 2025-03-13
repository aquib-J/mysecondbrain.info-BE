import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/env.js'
import { User } from '../databases/mysql8/db-schemas.js'
import Response from '../utils/Response.js';
import { StatusCodes } from 'http-status-codes';    

const authorize = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) return Response.fail(res, 'Unauthorized', StatusCodes.UNAUTHORIZED);

        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findOne({ where: { email: decoded.email } });

        if (!user) return Response.fail(res, 'Unauthorized', StatusCodes.UNAUTHORIZED); 

        req.user = user;

        next();
    } catch (error) {
        Response.fail(res, 'Unauthorized', StatusCodes.UNAUTHORIZED, error.message);;
    }
}

export default authorize;