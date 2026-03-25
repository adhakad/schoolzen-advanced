'use strict';

const toTitleCase = (str) => {
    if (!str || typeof str !== 'string') return '';

    return str
        .replace(/[_-]+/g, ' ')         // hyphen & underscore ko space se replace karo
        .replace(/\s+/g, ' ')            // multiple spaces/tabs/newlines ko single space
        .trim()                          // start/end ke extra spaces remove
        .toLowerCase()                   // pure string ko lower case me karo
        .split(' ')                      // space ke basis pe split
        .map(word => 
            word.charAt(0).toUpperCase() + word.slice(1) // first letter capital
        )
        .join(' ');                       // wapas string bana do
};

module.exports = { toTitleCase };
