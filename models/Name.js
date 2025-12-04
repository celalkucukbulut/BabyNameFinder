const mongoose = require('mongoose');

const nameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    gender: {
        type: String,
        required: true,
        enum: ['Kız', 'Erkek', 'Her ikisi']
    },
    origin: {
        type: String,
        required: true,
        trim: true
    },
    syllables: {
        type: Number,
        required: true,
        min: 1
    },
    length: {
        type: Number,
        required: true,
        min: 1
    },
    meaning: {
        type: String,
        required: true,
        trim: true
    },
    inQuran: {
        type: Boolean,
        required: true,
        default: false
    }
}, {
    timestamps: true // Automatically add createdAt and updatedAt fields
});

// Create indexes for faster queries
nameSchema.index({ name: 1 }); // Single field index
nameSchema.index({ name: 1, gender: 1 }); // Compound index for name + gender queries
nameSchema.index({ origin: 1 }); // Index for filtering by origin
nameSchema.index({ inQuran: 1 }); // Index for Quran filter
nameSchema.index({ gender: 1, origin: 1 }); // Common filter combination

// Prevent OverwriteModelError in serverless environments
const Name = mongoose.models.Name || mongoose.model('Name', nameSchema);

module.exports = Name;
