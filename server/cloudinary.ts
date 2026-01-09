/**
 * Cloudinary configuration for image uploads
 */

interface CloudinaryUploadResult {
    secure_url: string;
}

// Cloudinary SDK import - using dynamic import for compatibility
let cloudinaryInstance: any = null;

async function getCloudinary() {
    if (!cloudinaryInstance) {
        try {
            const cloudinaryModule = await import('cloudinary');
            cloudinaryInstance = cloudinaryModule.v2;

            // Configure Cloudinary
            cloudinaryInstance.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET,
            });
        } catch (error) {
            console.error('Failed to load cloudinary module:', error);
            throw error;
        }
    }
    return cloudinaryInstance;
}

/**
 * Upload a base64 image to Cloudinary
 */
export async function uploadImageToCloudinary(
    base64Data: string,
    folder: string = 'pathxpress/deliveries'
): Promise<string | null> {
    try {
        const cloudinary = await getCloudinary();

        // Ensure proper data URI format
        const imageData = base64Data.startsWith('data:image')
            ? base64Data
            : `data:image/jpeg;base64,${base64Data}`;

        const result: CloudinaryUploadResult = await cloudinary.uploader.upload(imageData, {
            folder,
            resource_type: 'image',
        });

        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return null;
    }
}

export default { uploadImageToCloudinary };
