result = """
# Outline
# Setting
The story unfolds in the vibrant Sylvarant Forest, a lush and vast woodland with babbling brooks, ancient trees, and a tapestry of flowers that bloom all year round. It is a hidden gem far away from human civilization, known only to the creatures that call it home. The forest is mysterious and holds many ancient secrets, including hidden paths that lead to enchanting clearings, and the Old Wispy Willow, the eldest and wisest tree in the forest.

# Main Characters
**Fiona the Fox** - A curious and sprightly young fox with a fiery red coat and an insatiable appetite for adventure. She is independent but learns the value of friendship and community throughout her journey.

**Oliver the Owl** - An old, wise owl who acts as the guardian of knowlege and the forest's historian. His character arc involves learning to leave his tree and participate more actively in the events of the forest, imparting his wisdom to help others.

**Luna the Rabbit** - A timid but intelligent rabbit with a white, fluffy coat who admires Fiona's bravery. She learns to overcome her fears and gains confidence as she aids Fiona on her quest.

**Benjamin the Bear** - A gentle giant with a deep rumbling voice that echoes through the forest. He embodies strength and has a heart of gold. Benjamin learns that despite his might, he sometimes needs help from his smaller friends, understanding the power of unity.

# Summary
The story begins with Fiona the Fox discovering a glowing gem nestled beneath the roots of the Old Wispy Willow. Compelled by its beauty, she takes the gem, unknowingly unlocking ancient magic that affects all of Sylvarant Forest. The once-peaceful flora and fauna begin to act strangely, caused by the disturbance of the forest's balance.

Fiona meets Oliver the Owl, who explains that the gem she found is actually the Heartstone, a magical item that maintains harmony in the forest. The disturbance now spreading can only be stopped by returning the Heartstone to its rightful place within the hidden Heartwood Glade.

Along her journey, Fiona enlists the help of Luna the Rabbit, overcoming dangerous obstacles together while forming a close bond. They are soon joined by Benjamin the Bear after saving him from a corrupted patch of forest affected by the imbalance.

Our group of unlikely friends face various challenges, from solving ancient riddles to navigating treacherous terrain. Fiona learns that despite her desire for independence, she needs her friends to succeed. Each friend plays a crucial role in reaching Heartwood Glade: Oliver provides knowledge, Luna offers cleverness, and Benjamin offers strength.

In a dramatic final challenge protecting the group from corrupted woodland creatures, they reach the Glade and Fiona places the gem back upon its pedestal. The forest is restored to its former glory, friendships are fortified, and our heroes return home as celebrated guardians of Sylvarant.

The story ends with the magical creatures hosting a grand celebration in honor of Fiona and her friends, cementing their new roles as defenders and champions of their woodland home. It's a heartwarming celebration of friendship, community, and inter-dependency.

# Tags
children's fiction, fantasy adventure, animal characters, magic, friendship, communityd
"""

import re

pattern = r"# Setting\n(.*?)\n\n# Main Characters\n(.*?)\n\n# Summary\n(.*?)\n\n# Tags\n(.*?)"
pattern = r"# Setting\n(.*?)\n\n# Main Characters\n(.*?)\n\n# Summary\n(.*?)\n\n# Tags\n(.*?)(?=\n|$)"

match = re.search(pattern, result, re.DOTALL)
# print(match)
if match:
    # print(match.group(3))
    pass

    # Everything except story base MUST be split before it is parsed.
def split_sections(string) -> dict:
    """
    Split the story outline into various sections based on predefined section delimiters.

    Thanks chatgpt.

    Args:
        string (str): The input text containing various sections.

    Returns:
        dict: Dictionary with each section and its content.
    """
    # List of permissible section delimiters
    section_delimiters = [
        '# Editing Notes',
        '# Outline',
        '# FactSheet',
        '# Characters',
        '# Scene',
    ]

    # Creating a regex pattern for the delimiters
    delimiter_pattern = '(' + '|'.join(re.escape(delimiter)
                                       for delimiter in section_delimiters) + ')'
    # print("DELIMETER REGEX: ", delimiter_pattern)

    # Regex pattern to match sections
    pattern = fr"{delimiter_pattern}\n(.*?)(?=(\n{delimiter_pattern}\n)|$)"

    # Finding all matches
    matches = re.findall(pattern, string, re.DOTALL)

    sections = {}
    for match in matches:
        # print(match)
        delimiter, content = match[0], match[1]
        sections[delimiter[2:].replace(" ", "_").lower()] = content.strip()

    return sections
# print(split_sections(result))


test = "## Scene 3\n### Paragraph: Katy's first impression of the courtyard's magical ecosystem\nKaty stepped into the courtyard, immediately enveloped by a symphony of nature and magic. Verdant vines climbed the stone walls, intertwining with flowering creepers that exuded a sweet, earthy fragrance. Students congregated in small clusters, their laughter mingling with the whispers of wind through leaves, while orbs of light floated above, casting a gentle luminescence over the scene. The air buzzed with the energy of life, each element in perfect harmony with the next.\n\n### Paragraph: Katy observes students working with bioluminescent flora\nDrawn to a corner where life seemed to pulse with an inner light, Katy watched students tend to a bed of bioluminescent flowers. Their hands moved with practiced care, coaxing growth with whispered incantations that made the petals shimmer in response. The flowers cast an ethereal glow on their faces, painting them with shades of sapphire and emerald as they worked in silent communion with the living light.\n\n### Dialogue: Katy's curiosity about the flowers and students' explanation of their care\n\"Those are mesmerizing,\" Katy remarked, her voice tinged with awe as she approached the group. \"What's the secret to their radiance?\"\n\nA student with hair like spun moonlight looked up, her smile warm. \"It's a delicate balance,\" she said. \"The right mixture of lunar water, starlight essence, and a touch of mana. They thrive on the energy we share.\"\n\nAnother student, his fingers dusted with pollen, chimed in, \"They're not just for beauty—they're vital to our nocturnal ecosystems. It's a symbiotic relationship.\"\n\n### Paragraph: Katy is intrigued by an archway where water flows upward\nKaty's gaze followed a vine-covered archway where water defied gravity, ascending in a serene dance. She marveled at the spellwork required to reverse the natural order, her mind alight with questions about the enchantments that made such wonders possible.\n\n### Dialogue: Jasper introduces himself and explains the water enchantment\n\"You're captivated by the archway,\" observed a voice tinged with amusement. Katy turned to find a boy with eyes as deep as forest shadows watching her. \"It's an advanced enchantment—reversing water's flow as a lesson in elemental mastery.\"\n\nKaty's curiosity sparked. \"How is it achieved?\" she inquired.\n\n\"With precision and reverence for water's true nature,\" he replied, his voice carrying notes of pride and respect. \"It's about harmony with the elements.\"\n\n### Paragraph: The courtyard transitions from day to night\nAs dusk settled over the academy, the courtyard donned a cloak of twilight. Golden light draped every leaf and stone, transforming the space into a realm of shifting silhouettes. Students' features were cast in soft relief against the encroaching night as they continued their magical endeavors.\n\n### Dialogue: Jasper shares academy lore about an ancient tree\n\"That oak,\" Jasper said, gesturing toward a venerable tree at the courtyard's edge, \"is as old as the Aetherium itself.\"\n\nKaty followed his gesture. \"It must hold countless stories,\" she mused.\n\nJasper's tone took on a somber note. \"Stories that would challenge what we're taught.\" His eyes hinted at secrets that weighed heavily on his conscience.\n\n### Paragraph: Katy senses tension beneath Jasper's words\nA chill traced Katy's spine as she sensed an undercurrent of tension beneath Jasper's words. There was something unsaid, a whisper of disquiet that clung to his carefully measured phrases. She found herself questioning what lay beneath the academy's verdant facade—the true nature of this place she now called home.\n\n### Dialogue: Katy probes Jasper about his cryptic comments\n\"What are you implying?\" Katy asked softly. \"Is there something I should know about the academy?\"\n\nJasper scanned their surroundings before leaning in closer. \"This isn't the place for such revelations,\" he murmured. \"Come.\"\n\n### Paragraph: They move to a secluded spot for privacy\nThey walked toward a secluded part of the courtyard where tall reeds whispered secrets only they knew. The bench they approached was hidden beneath a weeping willow whose leaves brushed the ground in tender strokes.\n\n### Dialogue: Jasper hints at forbidden experiments within the academy\nSeated away from prying eyes, Jasper spoke in hushed tones. \"There are endeavors here—endeavors that defy ethical boundaries.\"\n\nKaty felt a mix of trepidation and excitement stir within her. \"What kind of endeavors?\" she pressed.\n\n\"Those that could unravel the fabric of our harmony with nature,\" he replied, his voice grave.\n\n### Paragraph: Katy grapples with her desire for truth and her fears\nKaty sat back against the bench, her thoughts swirling in turmoil. The thirst for truth about the Aetherium warred with her fear of its implications. She had come here to learn and grow, but now she faced a path shrouded in uncertainty.\n\n### Dialogue: Katy expresses her concerns; Jasper emphasizes caution\n\"I need to understand,\" Katy admitted, \"but I'm wary of what it might mean for my place here.\"\n\nJasper offered a comforting squeeze on her shoulder. \"Knowledge is our greatest ally,\" he assured her. \"But we must navigate these waters with care.\" His gaze swept their surroundings before locking onto hers—a silent agreement sealed in shared resolve.\n\n### Paragraph: Night falls fully; Katy contemplates her next steps under the stars\nNight had fully claimed the courtyard now, and above them, stars emerged like beacons against the dark tapestry of sky. Katy watched them glimmer—a reminder of home and all she had left behind. She felt the weight of decisions yet to be made resting upon her shoulders like an invisible mantle woven from starlight and shadow."


def parse_scene_text(string):
    """
    Parse the scene text format into a dictionary.
    """
    section_pattern = r"### (Paragraph|Dialogue):? (.*?)\n(.*?)(?=\n|$)"
    sections = re.findall(section_pattern, string, re.DOTALL)

    scene_text = [{'type': sec_type, 'description': desc.strip(
    ), 'content': content.strip()} for sec_type, desc, content in sections]
    return {'sections': scene_text}

print(parse_scene_text(test))
