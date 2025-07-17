#!/usr/bin/env python3

from PIL import Image, ImageDraw, ImageFont
import os
import math

def create_app_icon():
    # App colors matching the Clear AF theme
    purple = "#6B46C1"  # Primary purple
    teal = "#06B6D4"    # Secondary teal
    white = "#FFFFFF"
    
    # Create 1024x1024 base icon (required for iOS)
    size = 1024
    icon = Image.new("RGB", (size, size), white)
    draw = ImageDraw.Draw(icon)
    
    # Create gradient background (purple to teal diagonal)
    for y in range(size):
        for x in range(size):
            # Create diagonal gradient from top-left purple to bottom-right teal
            ratio = (x + y) / (2 * size)
            r = int(107 + (6 - 107) * ratio)      # 107 -> 6
            g = int(70 + (182 - 70) * ratio)      # 70 -> 182  
            b = int(193 + (212 - 193) * ratio)    # 193 -> 212
            color = (r, g, b)
            draw.point((x, y), fill=color)
    
    # Add iOS-style rounded corners
    corner_radius = 180
    
    # Create mask for rounded corners
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=corner_radius, fill=255)
    
    # Apply mask to create rounded corners
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    output.paste(icon, (0, 0))
    output.putalpha(mask)
    icon = output.convert("RGB")
    draw = ImageDraw.Draw(icon)
    
    # Now draw the face outline
    center_x = size // 2
    center_y = size // 2 + 20  # Slightly lower
    
    # Face dimensions
    face_width = 280
    face_height = 350
    line_width = 12
    
    # Draw main face oval
    face_left = center_x - face_width // 2
    face_right = center_x + face_width // 2
    face_top = center_y - face_height // 2
    face_bottom = center_y + face_height // 2
    
    draw.ellipse([face_left, face_top, face_right, face_bottom], 
                outline=white, width=line_width, fill=None)
    
    # Draw hair/head outline extensions
    # Left hair strand
    hair_points_left = [
        (face_left - 20, face_bottom - 80),
        (face_left - 60, face_bottom + 20),
        (face_left - 40, face_bottom + 60),
        (face_left - 10, face_bottom + 40)
    ]
    
    # Right hair strand  
    hair_points_right = [
        (face_right + 20, face_bottom - 80),
        (face_right + 60, face_bottom + 20),
        (face_right + 40, face_bottom + 60),
        (face_right + 10, face_bottom + 40)
    ]
    
    # Draw hair strands as curves
    for i in range(len(hair_points_left) - 1):
        draw.line([hair_points_left[i], hair_points_left[i + 1]], 
                 fill=white, width=line_width)
    
    for i in range(len(hair_points_right) - 1):
        draw.line([hair_points_right[i], hair_points_right[i + 1]], 
                 fill=white, width=line_width)
    
    # Draw ears
    ear_width = 30
    ear_height = 60
    ear_offset_y = -20
    
    # Left ear
    left_ear = [face_left - ear_width//2, center_y + ear_offset_y - ear_height//2,
                face_left + ear_width//2, center_y + ear_offset_y + ear_height//2]
    draw.ellipse(left_ear, outline=white, width=line_width, fill=None)
    
    # Right ear  
    right_ear = [face_right - ear_width//2, center_y + ear_offset_y - ear_height//2,
                 face_right + ear_width//2, center_y + ear_offset_y + ear_height//2]
    draw.ellipse(right_ear, outline=white, width=line_width, fill=None)
    
    # Draw eyebrows
    eyebrow_y = center_y - 60
    eyebrow_width = 60
    eyebrow_spacing = 80
    
    # Left eyebrow (curved)
    left_brow_start = (center_x - eyebrow_spacing, eyebrow_y)
    left_brow_end = (center_x - eyebrow_spacing + eyebrow_width, eyebrow_y - 10)
    draw.line([left_brow_start, left_brow_end], fill=white, width=line_width)
    
    # Right eyebrow (curved)
    right_brow_start = (center_x + eyebrow_spacing, eyebrow_y)
    right_brow_end = (center_x + eyebrow_spacing - eyebrow_width, eyebrow_y - 10)
    draw.line([right_brow_start, right_brow_end], fill=white, width=line_width)
    
    # Draw nose (simple line)
    nose_top = (center_x, center_y - 10)
    nose_bottom = (center_x, center_y + 30)
    draw.line([nose_top, nose_bottom], fill=white, width=line_width)
    
    # Draw lips (small curve)
    lip_y = center_y + 80
    lip_width = 40
    
    # Simple lip curve
    lip_left = (center_x - lip_width//2, lip_y)
    lip_center = (center_x, lip_y + 8)
    lip_right = (center_x + lip_width//2, lip_y)
    
    # Draw lip as connected lines to form curve
    draw.line([lip_left, lip_center], fill=white, width=line_width)
    draw.line([lip_center, lip_right], fill=white, width=line_width)
    
    return icon

def main():
    print("Generating Clear AF face app icon...")
    
    # Create the icon
    icon = create_app_icon()
    
    # Save the main 1024x1024 icon
    icon_path = "/Users/aryansachdev/Desktop/ClearAF/ClearAF/Assets.xcassets/AppIcon.appiconset/"
    
    # Ensure directory exists
    os.makedirs(icon_path, exist_ok=True)
    
    # Save the 1024x1024 version (required for App Store)
    icon.save(f"{icon_path}app-icon-1024.png", "PNG", quality=100)
    
    # Generate other required sizes
    sizes = [
        (20, "20"),
        (29, "29"), 
        (40, "40"),
        (58, "58"),
        (60, "60"),
        (76, "76"),
        (80, "80"),
        (87, "87"),
        (120, "120"),
        (152, "152"),
        (167, "167"),
        (180, "180"),
        (1024, "1024")
    ]
    
    for size_px, name in sizes:
        resized = icon.resize((size_px, size_px), Image.Resampling.LANCZOS)
        resized.save(f"{icon_path}app-icon-{name}.png", "PNG", quality=100)
    
    print(f"✅ Face app icon generated successfully!")
    print(f"📁 Saved to: {icon_path}")
    print("🔄 Clean and rebuild your Xcode project to see the new icon.")

if __name__ == "__main__":
    main()