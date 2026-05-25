import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabaseClient';

export interface GeneratePixelPetResult {
  imageUrl: string;
  prompt: string;
}

/**
 * Generate a 2D pixel-art pet avatar from a source photo.
 * Calls the `generate-pixel-pet` Edge Function so the Seedream API key stays server-side.
 */
export async function generatePixelPet(
  imageUri: string,
  petBreed: string = 'pet',
  petFeatures: string = 'cute and fluffy',
): Promise<GeneratePixelPetResult> {
  const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: 'base64',
  });

  const { data, error } = await supabase.functions.invoke('generate-pixel-pet', {
    body: { imageBase64, petBreed, petFeatures },
  });

  if (error) {
    const serverMsg = (data as any)?.error;
    throw new Error(serverMsg || error.message || '生成失败');
  }
  if (!data?.imageUrl) {
    throw new Error('API 返回数据格式异常：未找到生成的图片 URL');
  }

  return { imageUrl: data.imageUrl, prompt: data.prompt };
}
