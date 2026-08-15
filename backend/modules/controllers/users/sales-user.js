'use strict';
const bcrypt = require('bcryptjs');
const tokenService = require('../../services/sales-token');
const SalesUserModel = require('../../models/users/sales-user');

// Sales users are cross-tenant — no adminId lookup indirection like admin/teacher login,
// just a direct salesUserId match. Records are inserted manually via MongoDB Compass with
// a pre-generated bcryptjs hash; this controller only ever reads/authenticates, never writes.
let LoginSalesUser = async (req, res, next) => {
    try {
        let salesUser = await SalesUserModel.findOne({ salesUserId: req.body.salesUserId });
        if (!salesUser) {
            return res.status(404).json('Username or password invalid!');
        }
        const passwordMatch = await bcrypt.compare(req.body.password, salesUser.password);
        if (!passwordMatch) {
            return res.status(404).json('Username or password invalid!');
        }
        if (salesUser.status !== 'active') {
            return res.status(400).json('Login permission inactive, please contact admin!');
        }
        const payload = { id: salesUser._id, salesUserId: salesUser.salesUserId, name: salesUser.name };
        const accessToken = await tokenService.getAccessToken(payload);
        const refreshToken = await tokenService.getRefreshToken(payload);
        if (accessToken && refreshToken) {
            return res.status(200).json({ salesUserInfo: salesUser, accessToken, refreshToken });
        }
        return res.status(400).json('Login error!');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let RefreshSalesToken = async (req, res, next) => {
    try {
        const { token } = req.body
        if (token) {
            const payload = await tokenService.verifyRefreshToken(token)
            const accessToken = await tokenService.getAccessToken(payload)
            res.send({ accessToken })
        }
        else {
            res.status(403).send('Token unavailable!')
        }
    } catch (err) {
        res.status(500).json(err)
    }
}

module.exports = {
    LoginSalesUser,
    RefreshSalesToken,
}
