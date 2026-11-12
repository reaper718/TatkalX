const jwt = require('jsonwebtoken');

const authenticateUser = (req,res,next) => {
    try {
        const authHeader = req.headers.authorization;

        if(!authHeader){
            return res.status(404).json({
                message: "Access denied. token missing"
            })
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token,'secretKey');

        req.user = decoded;
        next();
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: error
        })
    }
}

module.exports = authenticateUser;

