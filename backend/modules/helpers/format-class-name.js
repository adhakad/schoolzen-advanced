'use strict';
const getClassDisplayName = (className) => {
    const specialMap = {
        200: 'Nursery',
        201: 'LKG',
        202: 'UKG'
    };

    // Special cases check
    if (specialMap[className]) {
        return specialMap[className];
    }

    // Normal classes 1-12 with ordinal suffix
    if (className >= 1 && className <= 12) {
        const suffixes = ['th', 'st', 'nd', 'rd'];
        const v = className % 100;
        return `${className}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
    }

    return '';
}

module.exports = { getClassDisplayName };
