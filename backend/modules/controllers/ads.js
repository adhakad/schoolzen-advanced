'use strict';
const fs = require("fs");
const AdsModel = require('../models/ads');

let countAds = async (req, res, next) => {
    let countAds = await AdsModel.count();
    return res.status(200).json({ countAds });
}

let GetAdsPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
            ? {
                $or: [{ discount: searchText }, { price: searchText }],
            }
            : { title: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const adsList = await AdsModel.find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countAds = await AdsModel.count();

        let adsData = { countAds: 0 };
        adsData.adsList = adsList;
        adsData.countAds = countAds;
        return res.json(adsData);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetAllAds = async (req, res, next) => {
    try {
        const adsList = await AdsModel.find({});
        return res.status(200).json(adsList);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetSingleAds = async (req, res, next) => {
    try {
        const singleAds = await AdsModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleAds);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');;
    }
}
let CreateAds = async (req, res, next) => {
    const adsData = {
        title: req.body.title,
        image: req.file.filename,
    }
    try {
        let countAds = await AdsModel.count();
        if (countAds == 15) {
            return res.status(400).json('Ads limit is over to 15 !');
        }
        const createAds = await AdsModel.create(adsData);
        return res.status(200).json('Ads created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error !');;
    }
}
let UpdateAds = async (req, res, next) => {
    try {
        const id = req.params.id;
        const adsData = {
            title: req.body.title
        }
        const updateAds = await AdsModel.findByIdAndUpdate(id, { $set: adsData }, { new: true });
        return res.status(200).json('Ads update successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error !');;
    }
}
let DeleteAds = async (req, res, next) => {
    try {
        const id = req.params.id;
        const singleAds = await AdsModel.findOne({ _id: id });
        const singleImage = await singleAds.image;
        await fs.unlinkSync('./public/ads-image/' + singleImage);
        const deleteAds = await AdsModel.findByIdAndRemove(id);
        return res.status(200).json('Ads delete successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error !');;
    }
}

module.exports = {
    countAds,
    GetAdsPagination,
    GetAllAds,
    GetSingleAds,
    CreateAds,
    UpdateAds,
    DeleteAds,
}