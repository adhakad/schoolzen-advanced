'use strict';
const multer = require('multer');

const DIR = './public'

// Multer Mime Type Validation
const filter = (req, file, cb) => {
  if (
    file.mimetype == 'image/png' ||
    file.mimetype == 'image/jpg' ||
    file.mimetype == 'image/jpeg'
  ) {
    cb(null, true);
  } else {
    const error = new Error('Only png, jpg and jpeg format allowed!');
    error.name = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};
let filename = (req, file, cb) => {
  const fileName = Date.now() + Math.round(Math.random() * 10000) + '.' + file.originalname.split(".")[file.originalname.split(".").length - 1]
  cb(null, fileName)
};

let schoolLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/school-logo/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 100,
  },
  fileFilter: filter
})
let studentImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/student-image/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 100,
  },
  fileFilter: filter
})
let bannerImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/banner-image/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 200,
  },
  fileFilter: filter
})
let subjectImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/subject-image/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 200,
  },
  fileFilter: filter
})
let adsImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/ads-image/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 200,
  },
  fileFilter: filter
})
let topperImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/topper-image/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 200,
  },
  fileFilter: filter
})
let testimonialImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `${DIR}/testimonial-image/`)
    },
    filename: filename
  }),
  limits: {
    fileSize: 1024 * 200,
  },
  fileFilter: filter
})

module.exports = {
  bannerImage: bannerImage,
  subjectImage: subjectImage,
  adsImage: adsImage,
  topperImage: topperImage,
  testimonialImage: testimonialImage,
  schoolLogo,
  studentImage: studentImage
}