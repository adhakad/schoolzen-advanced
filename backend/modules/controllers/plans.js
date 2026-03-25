'use strict';
const PlansModel = require('../models/plans');

let GetPlansPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
            ? {
                $or: [{ discount: searchText }, { price: searchText }],
            }
            : { plans: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const plansList = await PlansModel.find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countPlans = await PlansModel.count();

        let plansData = { countPlans: 0 };
        plansData.plansList = plansList;
        plansData.countPlans = countPlans;
        return res.json(plansData);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetAllPlans = async (req, res, next) => {
    try {
        const plansList = await PlansModel.find({})
        return res.status(200).json(plansList);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetSinglePlans = async (req, res, next) => {
    try {
        const singlePlans = await PlansModel.findOne({ _id: req.params.id });
        return res.status(200).json(singlePlans);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetSinglePlansByPlans = async (req, res, next) => {
    try {
        const singlePlans = await PlansModel.findOne({ plans: req.params.id });
        return res.status(200).json(singlePlans);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let CreatePlans = async (req, res, next) => {
    let upgradePrice = 0;
    const singlePlans = await PlansModel.findOne({}).sort({ _id: -1 });
    const { plans, price, withoutDiscountPrice, discountPercentage, teacherLimit, studentLimit, perStudentIncrementPrice, studentIncrementRange, whatsappMessagesLimit, perStudentIncrementWhatsappMessage } = req.body;
    if (plans == "Standard" || plans == "Pro") {
        upgradePrice = price - singlePlans.price;
    }
    const plansData = {
        plans: plans,
        price: price,
        upgradePrice: upgradePrice,
        withoutDiscountPrice: withoutDiscountPrice,
        discountPercentage: discountPercentage,
        teacherLimit: teacherLimit,
        studentLimit: studentLimit,
        perStudentIncrementPrice: perStudentIncrementPrice,
        studentIncrementRange: studentIncrementRange,
        whatsappMessagesLimit: whatsappMessagesLimit,
        perStudentIncrementWhatsappMessage: perStudentIncrementWhatsappMessage

    }
    try {
        const countPlans = await PlansModel.count();
        if (countPlans == 3) {
            return res.status(400).json("Plans limit exceeded !")
        }
        const checkPlan = await PlansModel.findOne({ plans: plans });
        if (checkPlan) {
            return res.status(400).json("Plan already exist !");
        }
        const createPlan = await PlansModel.create(plansData);
        return res.status(200).json('Plan created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let UpdatePlans = async (req, res, next) => {
    try {
        const id = req.params.id;
        const plansData = {
            plans: req.body.plans
        }
        const updatePlans = await PlansModel.findByIdAndUpdate(id, { $set: plansData }, { new: true });
        return res.status(200).json('Plans update successfully !');
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let DeletePlans = async (req, res, next) => {
    try {
        const id = req.params.id;
        const deletePlans = await PlansModel.findByIdAndRemove(id);
        return res.status(200).json('Plans delete successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}

module.exports = {
    GetPlansPagination,
    GetAllPlans,
    GetSinglePlans,
    GetSinglePlansByPlans,
    CreatePlans,
    UpdatePlans,
    DeletePlans,
}