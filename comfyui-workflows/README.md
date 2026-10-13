# ComfyUI workflows: clothes swap and pose change

Two ComfyUI workflows (API format) sized for a 6 GB GPU (GTX 1660 Ti).
They have **not been run** on real hardware, so node or model names may need a small tweak on first load.

Only edit photos of people who have agreed to it.

## Setup

1. Install ComfyUI and ComfyUI Manager. Launch with `--fp32-vae` (avoids black images on 16-series GPUs).
2. Install these custom nodes via Manager:
   - `comfyui_segment_anything` (clothes swap)
   - `comfyui_controlnet_aux` (pose change)
   - `ComfyUI_IPAdapter_plus` (pose change)
3. Download models into `ComfyUI/models/`:

   | File | Folder | Used by |
   |---|---|---|
   | `sd-v1-5-inpainting.safetensors` (SD 1.5 inpainting) | `checkpoints/` | clothes swap |
   | A realistic SD1.5 checkpoint, e.g. Realistic Vision | `checkpoints/` | pose change |
   | `control_v11p_sd15_openpose.pth` | `controlnet/` | pose change |
   | `ip-adapter-plus-face_sd15.safetensors`, `ip-adapter-plus_sd15.safetensors` | `ipadapter/` | pose change |
   | `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | `clip_vision/` | pose change |
   | GroundingDINO + SAM `sam_vit_b` | auto-downloaded by the segment-anything nodes | clothes swap |

   Match the file names in the JSON (`ckpt_name`, etc.) to what you downloaded.
4. Copy your photos into `ComfyUI/input/` and set the file names on the **Load Image** nodes.

## Loading

Drag the JSON file onto the ComfyUI canvas. If your ComfyUI version doesn't accept it, update the frontend (`pip install -U comfyui-frontend-package`) or send it through the API (`POST /prompt` with `{"prompt": <file contents>}`).

## `clothes_swap_api.json`

Auto-masks a garment with text (GroundingDINO + SAM), inpaints it from your prompt, and pastes only the masked area back so the face and background are untouched.

- Change the mask text in node 6 (`"pants"`, `"shoes"`, `"dress"`).
- Describe the new outfit in node 8.
- Lower `denoise` in node 11 to keep more of the old clothing.
- If the mask misses part of the garment, raise `expand` in node 7 or lower `threshold` in node 6.

## `pose_change_api.json`

Extracts a skeleton from a pose reference photo (OpenPose ControlNet) and generates the person from your reference (IP-Adapter) in that pose.

- The result is a similar person in the new pose, not a pixel copy. Generate several variants (batch size, seed).
- Set the latent width/height (node 11) to the aspect ratio of the pose reference.
- To draw your own pose, delete node 4 and feed a skeleton image straight into node 8.
- Add Impact Pack's FaceDetailer and hand detector after node 13 for cleaner faces and hands.
