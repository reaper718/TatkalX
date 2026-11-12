const Users = require('../../models/Users');
const Organizations = require('../../models/Organizations');
const OrganizationMembers = require('../../models/Organozation_members');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sequelize = require('../../utils/db-connection');

const register = async (req,res) => {
    const t = await sequelize.transaction();
    try {
        const { fullName, email, password, phone, organization } = req.body;
        const { longitude, latitude } = organization;

        const existingUser = await Users.findOne({
            where: {
                email: email
            }
        });

        if(existingUser) {
            return res.status(409).json({
                success: false,
                message: "User already exits"
            })
        }

        const passwordHash = await bcrypt.hash(password,10);

        const user = await Users.create({
            full_name: fullName,
            email: email,
            password: passwordHash,
            phone: phone,
            system_role: 'USER',
            is_active: true
        }, {
            transaction: t
        });

        const newOrganization = await Organizations.create({
            name: organization.name,
            type: organization.type,
            address: organization.address,
            city: organization.city,
            location: {
                type: 'POINT',
                coordinates: [
                    longitude,
                    latitude
                ]
            },
            verification_status: 'PENDING',
            is_active: true
        },{
            transaction: t
        });

        const membership = await OrganizationMembers.create({
            user_id: user.id,
            organization_id: newOrganization.id,
            role: 'OWNER'  
        },{
            transaction: t
        });

        await t.commit();

        const newUser = {
            user,
            organization: newOrganization,
            membership
        }

        delete newUser.password;

        return res.status(200).json({
            success: true,
            message: "User created successfully",
            newUser
        })
    } catch (error) {
        await t.rollback();
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        })
    }
}

const login = async (req,res) => {
    try {
        const { email, password } = req.body;

        const user = await Users.findOne({
            where: {
                email: email
            }
        })

        if(!user){
            return res.status(404).json({
                success: false,
                message: "User does not exist"
            })
        }

        const isValidPassword = await bcrypt.compare(password, user.password);

        if(!isValidPassword){
            return res.status(403).json({
                success: false,
                message: "Incorrect Password"
            })
        }

        if(!user.is_active) {
            return res.status(409).json({
                success: false,
                message: "User is not active"
            })
        }

        const token = jwt.sign({id: user.id}, 'secretKey', {expiresIn: '24h'});

        return res.status(200).json({
            success: true,
            message: "User logged in successfully!!!",
            token: token
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        })
    }
}



const getMe = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await Users.findByPk(userId, {
            attributes: [
                'id',
                'full_name',
                'email',
                'phone',
                'system_role',
                'is_active'
            ],

            include: [
                {
                    model: OrganizationMembers,
                    as: 'organizationMemberships',
                    attributes: [
                        'id',
                        'role',
                        'createdAt'
                    ],

                    include: [
                        {
                            model: Organizations,
                            as: 'organization',
                            attributes: [
                                'id',
                                'name',
                                'type',
                                'city',
                                'verification_status',
                                'is_active'
                            ]
                        }
                    ]
                }
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'User account is inactive'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'User details fetched successfully',
            user
        });

    } catch (error) {
        console.error('Get user error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};



module.exports = {
    register,
    login,
    getMe
}