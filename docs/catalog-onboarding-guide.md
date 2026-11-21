# Onboarding a brand and its products

A one-page guide for the staff who add brands and products in the admin panel. Everything below is under
**Catalog** in the left-hand menu. Background: [decision 0063](decisions/0063-catalog-onboarding-design.md).

## The steps, in order

| #   | Screen                                                                | What you do                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Brands** → Add brand                                                | Name, manufacturer name and address, consumer care email and phone (all required by law). Then open the brand to upload its logo and add other spellings ("Havells India Ltd", "H.I.L") under **Other spellings**.        |
| 2   | **Categories** → pick a category → Set default                        | Optional: give the category a default HSN code. New products there start with that code and its GST rate.                                                                                                                 |
| 3a  | **Products** → New product                                            | One product at a time: category, name, brand, part number, the starred attributes. Save the draft, then add at least one image.                                                                                           |
| 3b  | **Import**                                                            | Many products: choose the category, download the template, fill it, upload it. It runs in the background; the page shows progress and then how many rows were accepted and rejected.                                      |
| 4   | **Import** → Past imports → Download rejected rows                    | Open the file: the last column says what is wrong with each row. Fix those rows and upload that file again on its own.                                                                                                    |
| 5   | **Products** → Upload images                                          | Drop many pictures at once. Name each file by product code (`GA-0110919.jpg`) or by the brand's part number (`MCB-10.jpg`); add `_2`, `_3` for more pictures of the same product. Pick the brand if you use part numbers. |
| 6   | **Products** → Brand filter → Draft → Publish all drafts of the brand | Products that are ready go live. Any that are not are listed with what they still need.                                                                                                                                   |

## What the messages mean

| Message                                                                        | What to do                                                                                                      |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| brand "X" is not in the catalog. Add it on the Brands page first               | Add the brand (step 1), or add "X" as another spelling of the right brand. Then upload the rejected rows again. |
| brand "X" is deactivated                                                       | Reactivate the brand on **Brands**, or use the right brand.                                                     |
| brand "X" already exists / is already an alias of brand "Y"                    | The brand is already there under another spelling. Use that one.                                                |
| "Shiny" is not a valid option — expected one of: …                             | Pick one of the listed values in the template's dropdown.                                                       |
| duplicate — brand + MPN already exists as GA-…                                 | That product is already in the catalog. Nothing to do, or correct the part number.                              |
| Cannot publish: needs at least one image / Missing: Finish                     | Open the product, add an image or fill in the listed attributes, then publish.                                  |
| HSN code (warning)                                                             | Publishing is allowed; add the HSN code when you have it (it will be needed on invoices).                       |
| a product with the same category and attribute combination already exists      | An identical product is already live. Merge this one into it (below) instead of publishing it.                  |
| The file is larger than 20 MB / Upload the filled-in template as an .xlsx file | Split the file, or save it as .xlsx from Excel.                                                                 |

## Fixing a mistake

| Mistake                                  | Fix                                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong brand, part number, GTIN, HSN code | Open the product → **Edit**. The category cannot be changed: retire the product and add it again in the right category.                                           |
| A whole upload was wrong                 | **Import** → Past imports → **Undo**. Drafts nobody has touched are deleted; products a vendor already sells are kept.                                            |
| A product should not be sold             | Open it → **Retire**. Vendor listings are paused. **Restore** brings it back as a draft.                                                                          |
| A draft created by mistake               | Open it → **Delete** (only drafts with no vendor listing; otherwise retire it).                                                                                   |
| The same product twice                   | Open the extra one → **Merge into…** → pick the one to keep. Listings move over; if one vendor sells both, its extra listing is paused for review, never deleted. |
| The same brand twice                     | **Brands** → open the extra one → **Merge into…**. If both brands have a product with the same part number, merge those products first.                           |
| A vendor's row matched no product        | **Review queue** → open the row → **Create product from this row**. The form opens with the vendor's details; after saving, the row is linked to the new product. |
