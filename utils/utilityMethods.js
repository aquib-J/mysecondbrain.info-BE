class UtilityMethods {

    static cleanAndJoinString(str) {
    if (typeof str !== 'string') {
        throw new Error('Input must be a string');
    }

    // Remove leading and trailing spaces, split by spaces, filter out empty parts, and join with '_'
    return str.trim().split(/\s+/).filter(Boolean).join('_');
    }
    
}

export default UtilityMethods;