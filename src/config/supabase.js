const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET || "seenways-images";

async function uploadImage(buffer, filename, mimetype) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(`products/${filename}`, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(error.message);
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(`products/${filename}`);
  return urlData.publicUrl;
}

async function deleteImage(filename) {
  const { error } = await supabase.storage.from(BUCKET).remove([`products/${filename}`]);
  if (error) throw new Error(error.message);
  return true;
}

module.exports = { supabase, uploadImage, deleteImage, BUCKET };
